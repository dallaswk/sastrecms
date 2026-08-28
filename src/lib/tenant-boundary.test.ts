import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * La frontera entre tenants, comprobada sobre el fuente.
 *
 * El paso siguiente al multi-tenant no es un panel: es esto. Con varios sitios en una base,
 * **una** consulta que olvide el `siteId` deja de ser «contenido que no debería verse» y pasa a
 * ser un cliente viendo el de otro. Y falla en silencio: la página se pinta, nadie ve un error,
 * y se descubre cuando lo descubre el cliente.
 *
 * Este test no levanta un servidor. Recorre el fuente y comprueba que cada lectura o escritura
 * sobre una tabla con dueño menciona el sitio en su condición — directamente o a través de uno
 * de los ayudantes que lo incluyen. Es la misma técnica que el proyecto ya usa para el registro
 * de secciones frente al mapa de componentes: una frontera que vitest no puede cruzar de otra
 * forma.
 *
 * La comprobación de punta a punta —dos sitios reales, dos administradores, cada acción y cada
 * herramienta MCP intentando cruzar— vive en `scripts/check-tenant-boundary.sh`, porque necesita
 * el servidor levantado.
 */

/** Tablas cuyas filas pertenecen a un sitio. Tocarlas sin filtrar es cruzar la frontera. */
const SCOPED_TABLES = [
  "nodes",
  "contentTypes",
  "media",
  "mediaFolders",
  "settings",
  "formSubmissions",
  "nodeRevisions",
  "roles",
  "userRoles",
  "apiTokens",
];

/**
 * Formas que ya llevan el sitio dentro.
 *
 * `visibleNodes`, `activeNodes` y compañía construyen la condición en `lib/node-queries.ts`,
 * que existe justamente para que el filtro esté escrito una vez.
 */
const SCOPED_HELPERS = [
  "siteId",
  "site_id",
  "visibleNodes(",
  "activeNodes(",
  "previewableNodes(",
  "trashedNodes(",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|astro)$/.test(entry) && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** Every `db.query.<table>.findFirst({...})` / `.findMany({...})`, with its options object. */
function findQueries(source: string) {
  const hits: { table: string; options: string; index: number }[] = [];

  for (const match of source.matchAll(/\.query\.(\w+)\.(findFirst|findMany)\(/g)) {
    const start = match.index! + match[0].length - 1;
    let depth = 0;
    let end = start;
    for (let i = start; i < source.length; i++) {
      if (source[i] === "(") depth++;
      if (source[i] === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    hits.push({ table: match[1]!, options: source.slice(start, end + 1), index: match.index! });
  }
  return hits;
}

/** Every `db.update(<table>)` / `db.delete(<table>)`, with the statement that follows. */
function findWrites(source: string) {
  const hits: { table: string; statement: string; index: number }[] = [];

  for (const match of source.matchAll(/\bdb\s*\n?\s*\.(update|delete)\((\w+)\)/g)) {
    const rest = source.slice(match.index!);
    const end = rest.indexOf(";");
    hits.push({
      table: match[2]!,
      statement: rest.slice(0, end === -1 ? 400 : end),
      index: match.index!,
    });
  }
  return hits;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/**
 * Whether a condition is scoped, following one level of indirection.
 *
 * Half the real queries build their `where` in a variable first — `const conditions =
 * [eq(nodes.siteId, siteId)]`, then `and(...conditions)` — because the filter is optional and
 * the scope is not. Reading only the call site marks every one of those as a leak, and a check
 * with five known false positives is a check nobody reads.
 *
 * But only an identifier that *is* the condition gets followed: `where` itself, or a `...spread`
 * into it. Resolving every name in the expression was the first version of this and it was worse
 * than useless — in `[...slug].astro` the translations query mentions `node`, `node` had been
 * loaded with `visibleNodes(siteId)`, and so an unscoped read across a whole translation group
 * came back clean. That a nearby row was fetched safely says nothing about this one; it is the
 * exact reasoning this file exists to stop trusting.
 */
function isScoped(condition: string, source: string): boolean {
  if (SCOPED_HELPERS.some((helper) => condition.includes(helper))) return true;

  const names = new Set<string>();

  const named = /\bwhere\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/.exec(condition);
  if (named?.[1]) names.add(named[1]);
  if (/\bwhere\s*[,}]/.test(condition)) names.add("where");
  for (const spread of condition.matchAll(/\.\.\.([A-Za-z_$][\w$]*)/g)) names.add(spread[1]!);

  for (const name of names) {
    const declaration = new RegExp(`\\bconst\\s+${name}\\b[^=]*=`).exec(source);
    if (!declaration) continue;
    // From the `=` to the end of the statement. Generous rather than exact: this only decides
    // whether the word `siteId` appears anywhere in it, so overshooting costs nothing.
    const body = source.slice(declaration.index, declaration.index + 600).split(";")[0]!;
    if (SCOPED_HELPERS.some((helper) => body.includes(helper))) return true;
  }

  return false;
}

const SOURCES = walk("src");

/**
 * Las consultas que no pueden llevar el sitio, con su razón.
 *
 * Validar un token de API es el momento *anterior* a saber de qué sitio se trata: el token es
 * precisamente lo que lo dice. Buscarlo acotado por sitio sería preguntar por la respuesta. Lo
 * que sí hace `validateApiToken` es rechazarlo comparando `token.siteId` con el sitio de la
 * petición nada más leerlo, antes incluso de confirmar que su dueño existe.
 *
 * Es una lista y no una regla, con dos condiciones: cada entrada dice por qué, y el test de más
 * abajo falla si una entrada deja de corresponder a ninguna consulta real. Una exención muerta
 * es peor que no tenerla — parece que alguien lo pensó, y ya no lo está pensando nadie.
 */
const EXEMPT: { file: string; table: string; why: string }[] = [
  {
    file: "src/lib/api-token.ts",
    table: "apiTokens",
    why: "el token es lo que identifica al sitio, y se contrasta con él en cuanto se lee",
  },
];

const used = new Set<string>();

function isExempt(file: string, table: string): boolean {
  const hit = EXEMPT.find((e) => file.endsWith(e.file) && e.table === table);
  if (!hit) return false;
  used.add(`${hit.file}:${hit.table}`);
  return true;
}

describe("frontera entre tenants: lecturas", () => {
  const offenders: string[] = [];

  for (const file of SOURCES) {
    const source = readFileSync(file, "utf8");
    for (const hit of findQueries(source)) {
      if (!SCOPED_TABLES.includes(hit.table)) continue;
      if (isScoped(hit.options, source)) continue;
      if (isExempt(file, hit.table)) continue;
      offenders.push(`${file}:${lineOf(source, hit.index)} — db.query.${hit.table} sin siteId`);
    }
  }

  it("toda consulta a una tabla con dueño filtra por sitio", () => {
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("frontera entre tenants: escrituras", () => {
  const offenders: string[] = [];

  for (const file of SOURCES) {
    const source = readFileSync(file, "utf8");
    for (const hit of findWrites(source)) {
      if (!SCOPED_TABLES.includes(hit.table)) continue;
      if (isScoped(hit.statement, source)) continue;
      if (isExempt(file, hit.table)) continue;
      offenders.push(`${file}:${lineOf(source, hit.index)} — db.${hit.table} escrito sin siteId`);
    }
  }

  it("todo update o delete sobre una tabla con dueño acota por sitio", () => {
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("el test se está mirando algo", () => {
  it("no arrastra exenciones muertas", () => {
    // Se evalúa después de las dos pasadas de arriba, que son las que marcan cuáles se han
    // usado. Una entrada que ya no corresponde a ninguna consulta es una puerta abierta a un
    // fichero entero por una razón que dejó de existir.
    const dead = EXEMPT.filter((e) => !used.has(`${e.file}:${e.table}`));
    expect(dead.map((e) => `${e.file} (${e.table}): ${e.why}`)).toEqual([]);
  });

  it("encuentra consultas de verdad, no cero por un patrón roto", () => {
    // Sin esto, cambiar la forma de las consultas dejaría el test en verde sin comprobar nada.
    const total = SOURCES.reduce(
      (sum, file) => sum + findQueries(readFileSync(file, "utf8")).length,
      0
    );
    expect(total).toBeGreaterThan(40);
  });

  it("detecta una consulta sin acotar", () => {
    const bad = `const x = await db.query.nodes.findFirst({ where: eq(nodes.id, input.id) });`;
    const hits = findQueries(bad);
    expect(hits).toHaveLength(1);
    expect(isScoped(hits[0]!.options, bad)).toBe(false);
  });

  it("no se deja engañar porque otra fila cercana sí se leyera acotada", () => {
    // El fallo real de la primera versión de `isScoped`, con la forma de `[...slug].astro`.
    const source = `
      const node = await db.query.nodes.findFirst({ where: visibleNodes(siteId, now) });
      const others = await db.query.nodes.findMany({
        where: eq(nodes.translationGroupId, node.translationGroupId),
      });`;
    const translations = findQueries(source)[1]!;
    expect(isScoped(translations.options, source)).toBe(false);
  });

  it("sí sigue la condición cuando es la propia variable", () => {
    const source = `
      const conditions = [eq(media.siteId, siteId)];
      const files = await db.query.media.findMany({ where: and(...conditions) });`;
    expect(isScoped(findQueries(source)[0]!.options, source)).toBe(true);
  });
});
