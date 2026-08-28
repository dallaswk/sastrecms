#!/usr/bin/env bash
#
# ¿Puede el administrador del sitio B tocar el contenido del sitio A?
#
# Con un solo sitio esta pregunta no existía. Con varios es la única que importa: un fallo de
# permisos enseña de más a alguien de casa, y un fallo de frontera enseña el negocio de un
# cliente a otro. Por eso se prueba antes de construir nada encima.
#
# El test de `src/lib/tenant-boundary.test.ts` cubre el mismo terreno sobre el fuente y corre en
# CI. Éste lo cubre de verdad: sesiones HTTP reales, dos administradores distintos, cada acción
# y cada herramienta MCP intentando cruzar. Necesita el servidor levantado, así que se lanza a
# mano.
#
#   npm run dev
#   scripts/check-tenant-boundary.sh
#
# Requisitos previos (se comprueban y se explican si faltan):
#   - dos sitios en la base, uno de ellos con `host` apuntando a $HOST_B
#   - un administrador en cada uno, con la misma contraseña
#
set -uo pipefail

BASE="${BASE:-http://localhost:4321}"
HOST_A="${HOST_A:-localhost:4321}"
HOST_B="${HOST_B:-segundo.localhost:4321}"
USER_A="${USER_A:-admin-a@test.local}"
USER_B="${USER_B:-admin-b@test.local}"
PASSWORD="${PASSWORD:-frontera-12345}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0

# ── salida ────────────────────────────────────────────────────────────────────
green() { printf '\033[32m%s\033[0m' "$1"; }
red()   { printf '\033[31m%s\033[0m' "$1"; }
head2() { printf '\n\033[1m%s\033[0m\n' "$1"; }

die() { printf '\n%s %s\n\n' "$(red 'No se puede probar:')" "$1" >&2; exit 2; }

# ── sesiones ──────────────────────────────────────────────────────────────────
login() { # email cookiejar host
  local code
  code=$(curl -s -c "$2" -H "Host: $3" -X POST "$BASE/api/auth/sign-in/email" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}" -o /dev/null -w '%{http_code}')
  [ "$code" = "200" ] || die "no entra $1 en $3 (HTTP $code). ¿Existe el usuario y la contraseña es \$PASSWORD?"
}

# Construye el cuerpo JSON.
#
# No es ceremonia: escribir `"{\"id\":\"$X\",\"t\":\"y\"}"` dentro de un `$( )` deja el
# token sin comillas, y entonces bash **expande las llaves** — `{a,b}` se convierte en dos
# palabras. El resultado es que sólo los cuerpos de más de una clave llegaban partidos, el
# servidor devolvía un SyntaxError, y el arnés lo leía como «cruza la frontera». Un falso
# positivo en la única prueba que existe para descartar falsos negativos.
json() { # clave valor [clave valor ...]
  local out="" key value
  while [ $# -gt 1 ]; do
    key=$1; value=$2; shift 2
    out="$out${out:+,}\"$key\":\"$value\""
  done
  printf '{%s}' "$out"
}

act() { # cookiejar host accion cuerpo
  curl -s -b "$1" -H "Host: $2" -X POST "$BASE/_actions/$3" \
    -H 'Content-Type: application/json' -d "$4"
}

mcp() { # token host herramienta argumentos
  curl -s -H "Host: $2" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
    -X POST "$BASE/api/mcp" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$3\",\"arguments\":$4}}"
}

# Las actions responden en devalue, no en JSON. Hay que decodificar antes de juzgar: leído con
# `JSON.parse` el cuerpo es una lista de enteros, y con eso una fuga y un bloqueo son
# indistinguibles — la primera versión de esto marcaba las dos cosas como «respuesta ilegible».
decode() { node "$ROOT/scripts/lib/decode-action.mjs" "$1"; }

# ── veredicto ─────────────────────────────────────────────────────────────────
#
# Bloquear bien tiene dos formas legítimas y hay que aceptar las dos: un error («no existe»,
# que es la respuesta correcta — no «no puedes», que ya confirma que existe) y una lista vacía.
# Cualquier otra cosa es una fuga, incluido un 200 con datos dentro.
verdict() { # nombre respuesta
  local name="$1" raw out
  raw=$(decode "$2")
  out=$(RAW="$raw" NAME="$name" python3 - <<'PY'
import json, os, sys

name, raw = os.environ["NAME"], os.environ["RAW"]

def emit(ok, label, detail=""):
    print(f"{'OK' if ok else 'LEAK'}\t{name}\t{label}\t{detail[:60]}")

try:
    data = json.loads(raw)
except Exception:
    emit(False, "respuesta ilegible", raw[:60]); sys.exit()

if isinstance(data, dict) and "__unreadable" in data:
    emit(False, "respuesta ilegible", data["__unreadable"]); sys.exit()

# Un error de action: es la forma correcta de bloquear («no existe», no «no puedes», que ya
# confirmaría que existe en otro sitio).
if isinstance(data, dict) and data.get("type") == "AstroActionInputError":
    emit(False, "ENTRADA MAL FORMADA", json.dumps(data.get("issues", ""), ensure_ascii=False)); sys.exit()

if isinstance(data, dict) and data.get("type") == "AstroActionError":
    emit(True, "bloqueado", str(data.get("message", ""))); sys.exit()

# MCP habla JSON-RPC.
if isinstance(data, dict) and "error" in data:
    emit(True, "bloqueado", str(data["error"].get("message", ""))); sys.exit()
if isinstance(data, dict) and isinstance(data.get("result"), dict):
    result = data["result"]
    if result.get("isError"):
        emit(True, "bloqueado", json.dumps(result.get("content", ""), ensure_ascii=False)); sys.exit()
    body = json.dumps(result.get("content", result), ensure_ascii=False)
    if '"[]"' in body or body.strip() == "[]":
        emit(True, "vacío"); sys.exit()
    emit(False, "PASA", body); sys.exit()

if data in ([], {}, None) or data is False:
    emit(True, "vacío"); sys.exit()

emit(False, "PASA", json.dumps(data, ensure_ascii=False))
PY
)
  local status label detail
  IFS=$'\t' read -r status _ label detail <<<"$out"
  if [ "$status" = "OK" ]; then
    pass=$((pass + 1)); printf '  %-36s %s  %s\n' "$name" "$(green 'bloqueado')" "$detail"
  else
    fail=$((fail + 1)); printf '  %-36s %s  %s\n' "$name" "$(red '*** PASA ***')" "$detail"
  fi
}

# `contains` es para lo contrario: comprobar que cada sitio SÍ ve lo suyo. Una frontera que
# bloquea todo, incluido el propio contenido, también pasaría el resto de este guion.
own() { # nombre respuesta aguja
  if grep -q "$3" <<<"$2"; then
    pass=$((pass + 1)); printf '  %-36s %s\n' "$1" "$(green 've lo suyo')"
  else
    fail=$((fail + 1)); printf '  %-36s %s  %s\n' "$1" "$(red 'NO ve lo suyo')" "${2:0:60}"
  fi
}

# ── preparación ───────────────────────────────────────────────────────────────
curl -sf -o /dev/null "$BASE/admin" --max-time 5 || die "no responde $BASE. ¿Está \`npm run dev\` levantado?"

login "$USER_A" "$TMP/a" "$HOST_A"
login "$USER_B" "$TMP/b" "$HOST_B"

LIST_A=$(act "$TMP/a" "$HOST_A" nodes.list '{}')
LIST_B=$(act "$TMP/b" "$HOST_B" nodes.list '{}')

pick() { decode "$1" | python3 -c "
import json,sys
rows=json.load(sys.stdin)
print(rows[0]['id'] if isinstance(rows,list) and rows else '')"; }

NODE_A=$(pick "$LIST_A")
NODE_B=$(pick "$LIST_B")

# El tipo de contenido propio de B. `nodes.create` se prueba con éste a propósito: si se le
# pasara el tipo de A, el bloqueo vendría de «ese tipo no existe» y no habríamos probado nada
# sobre el padre, que es lo que cruza la frontera.
read -r TYPE_B TITLE_B <<<"$(decode "$LIST_B" | python3 -c "
import json,sys
rows=json.load(sys.stdin)
r=rows[0] if isinstance(rows,list) and rows else {}
print(r.get('contentTypeId','-'), (r.get('title','-').split(' ') or ['-'])[0])")"

# Una ruta que exista en B y NO en A.
#
# `create_page_from_sections` resuelve el padre por ruta, y la resolución sí filtra por sitio.
# Si se le pasa una ruta que A también tiene —«/», por ejemplo— encuentra la de A, crea la
# página, y el arnés lo lee como fuga cuando el comportamiento ha sido el correcto. Fue el único
# rojo de la primera pasada completa.
PATH_B=$(python3 -c "
import json,sys
a,b = json.loads(sys.argv[1]), json.loads(sys.argv[2])
mine = {n['path'] for n in a}
print(next((n['path'] for n in b if n['path'] not in mine), ''))" "$(decode "$LIST_A")" "$(decode "$LIST_B")")
[ -n "$NODE_A" ] || die "el sitio A no tiene ni un nodo: no hay nada que intentar robar."
[ -n "$NODE_B" ] || die "el sitio B ($HOST_B) no tiene ni un nodo. ¿Está mapeado el host?"
[ "$NODE_A" != "$NODE_B" ] || die "los dos hosts resuelven al mismo sitio: \`sites.host\` no está puesto para $HOST_B."

printf 'sitio A %s → nodo %s\nsitio B %s → nodo %s\n' "$HOST_A" "$NODE_A" "$HOST_B" "$NODE_B"

# ── 1. cada uno ve lo suyo ────────────────────────────────────────────────────
head2 "Cada sitio ve su propio contenido"
own "A: nodes.list"  "$LIST_A" "$NODE_A"
own "B: nodes.list"  "$LIST_B" "$NODE_B"

# ── 2. las acciones, de B contra A ────────────────────────────────────────────
head2 "Acciones: B autenticado, apuntando al nodo de A ($NODE_A)"

cross() { # nombre accion cuerpo
  verdict "$1" "$(act "$TMP/b" "$HOST_B" "$2" "$3")"
}

cross "nodes.get"         nodes.get         "$(json id "$NODE_A")"
cross "nodes.update"      nodes.update      "$(json id "$NODE_A" title secuestrado)"
cross "nodes.publish"     nodes.publish     "$(json id "$NODE_A")"
cross "nodes.delete"      nodes.delete      "$(json id "$NODE_A")"
cross "nodes.restore"     nodes.restore     "$(json id "$NODE_A")"
cross "nodes.revisions"   nodes.revisions   "$(json nodeId "$NODE_A")"
cross "nodes.previewLink" nodes.previewLink "$(json nodeId "$NODE_A")"
cross "nodes.create hijo" nodes.create      "$(json title colado contentTypeId "$TYPE_B" parentId "$NODE_A")"

# ── 3. los listados no se mezclan ─────────────────────────────────────────────
head2 "Listados: B no encuentra nada de A"
for action in nodes.trash contentTypes.list media.list forms.list; do
  body=$(act "$TMP/b" "$HOST_B" "$action" '{}')
  if grep -q "$NODE_A" <<<"$body"; then
    fail=$((fail + 1)); printf '  %-36s %s\n' "$action" "$(red '*** contiene el nodo de A ***')"
  else
    pass=$((pass + 1)); printf '  %-36s %s\n' "$action" "$(green 'sólo lo suyo')"
  fi
done

# ── 4. los tokens no cruzan ───────────────────────────────────────────────────
head2 "Un token creado en A, usado contra B"
TOKEN=$(decode "$(act "$TMP/a" "$HOST_A" tokens.create '{"label":"frontera"}')" | python3 -c "
import json,sys
v=json.load(sys.stdin)
print(v.get('rawToken','') if isinstance(v,dict) else '')")

if [ -z "$TOKEN" ]; then
  printf '  %s\n' "$(red 'no se ha podido crear el token; se salta el bloque MCP')"
  fail=$((fail + 1))
else
  code=$(curl -s -o "$TMP/out" -w '%{http_code}' -H "Host: $HOST_B" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -X POST "$BASE/api/mcp" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
  if grep -qi "inválido\|invalid\|unauthor" "$TMP/out" || [ "$code" = "401" ]; then
    pass=$((pass + 1)); printf '  %-36s %s\n' "token de A en el host de B" "$(green 'rechazado')"
  else
    fail=$((fail + 1)); printf '  %-36s %s  %s\n' "token de A en el host de B" "$(red '*** ACEPTADO ***')" "$(head -c 60 "$TMP/out")"
  fi

  # Y con el token en su propio host, pidiendo cosas del otro sitio.
  head2 "MCP: token de A en su host, apuntando al nodo de B ($NODE_B)"

  # La `@` del cuerpo es el nodo de B. Sustituida aquí y no interpolada arriba para que los
  # cuerpos puedan ir entre comillas simples: ver la nota de `json`.
  # La `@` del cuerpo es el nodo de B, y `#` su ruta. Sustituidos aquí y no interpolados en la
  # plantilla para que los cuerpos vayan entre comillas simples: ver la nota de `json`.
  mcross() { # nombre herramienta plantilla
    local body="${3//@/$NODE_B}"
    verdict "$1" "$(mcp "$TOKEN" "$HOST_A" "$2" "${body//\#/$PATH_B}")"
  }

  # Las once herramientas a las que se les puede pasar un id ajeno.
  mcross "get_node"        get_node        '{"id":"@"}'
  mcross "update_node"     update_node     '{"id":"@","title":"secuestrado"}'
  mcross "publish_node"    publish_node    '{"id":"@"}'
  mcross "delete_node"     delete_node     '{"id":"@"}'
  mcross "create_node"     create_node     '{"title":"colado","contentTypeId":"ct_page","parentId":"@"}'
  mcross "get_sections"    get_sections    '{"nodeId":"@"}'
  mcross "set_sections"    set_sections    '{"nodeId":"@","sections":[]}'
  mcross "add_section"     add_section     '{"nodeId":"@","type":"prose","data":{}}'
  mcross "patch_section"   patch_section   '{"nodeId":"@","sectionId":"x","data":{}}'
  mcross "move_section"    move_section    '{"nodeId":"@","sectionId":"x","toIndex":0}'
  mcross "remove_section"  remove_section  '{"nodeId":"@","sectionId":"x"}'
  if [ -n "$PATH_B" ]; then
    mcross "create_page…"  create_page_from_sections \
      '{"title":"colada","parentPath":"#","sections":[{"type":"prose","data":{"body":"x"}}]}'
  else
    printf '  %-36s %s\n' "create_page…" "no concluyente: B no tiene ninguna ruta que A no tenga"
  fi

  # Y las que no reciben id: aquí la fuga sería devolver contenido de B en el listado.
  head2 "MCP: los listados de A no contienen nada de B"
  leaks() { # nombre herramienta cuerpo aguja
    local body
    body=$(mcp "$TOKEN" "$HOST_A" "$2" "$3")
    if grep -qF "$4" <<<"$body"; then
      fail=$((fail + 1)); printf '  %-36s %s  %s\n' "$1" "$(red '*** contiene lo de B ***')" "$4"
    else
      pass=$((pass + 1)); printf '  %-36s %s\n' "$1" "$(green 'sólo lo suyo')"
    fi
  }
  leaks "list_nodes"        list_nodes        '{}'                          "$NODE_B"
  leaks "list_media"        list_media        '{}'                          "$NODE_B"
  leaks "list_content_types" list_content_types '{}'                        "$TYPE_B"
  leaks "search_content"    search_content    "$(json query "$TITLE_B")"    "$NODE_B"
  leaks "get_settings"      get_settings      '{}'                          "$NODE_B"
fi

# ── resultado ─────────────────────────────────────────────────────────────────
printf '\n%d comprobaciones, ' "$((pass + fail))"
if [ "$fail" -eq 0 ]; then
  printf '%s\n\n' "$(green 'la frontera aguanta')"
else
  printf '%s\n\n' "$(red "$fail CRUZAN LA FRONTERA")"
fi
exit $((fail > 0))
