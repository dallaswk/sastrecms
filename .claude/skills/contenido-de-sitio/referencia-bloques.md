# Referencia de bloques

Generado del registro (`src/lib/sections/registry.ts`). **No es la fuente de la verdad**:
si algo aquí no cuadra, manda `src/lib/sections/defs/*.ts`. Para regenerarlo:

```bash
npx tsx -e 'import {SECTIONS} from "./src/lib/sections/registry"; for (const d of Object.values(SECTIONS)) console.log(d.type, d.fields.map(f=>f.key).join(", "))'
```

Los campos `image` y `gallery` guardan la **URL** del archivo. Desde un guion se declaran
con `@clave` contra la lista `images` del contenido, que descarga la foto y la registra en
la biblioteca antes de escribir las páginas; sin foto, `""` o `[]`. Un `select` sólo acepta
los valores listados: cualquier otro se descarta en la validación del servidor y el bloque
se pinta a medias.

Un campo `relation` (hoy sólo `collection.parent`) se declara con el **slug** de otra página
del mismo guion: el sembrador lo cambia por el id cuando ese id existe.

### `hero` — Portada (v1)

Bloque de apertura a pantalla ancha: titular, texto de apoyo, imagen de fondo y un botón. Se usa como primer bloque de una página; no pongas dos en la misma.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text | sí |  |
| `subtitle` | textarea |  |  |
| `image` | image |  |  |
| `cta_label` | text |  |  |
| `cta_url` | text |  |  |
| `align` | select |  | `izquierda` · `centro` |

Por defecto: `{"align":"centro"}`

### `notice` — Aviso (v1)

Franja estrecha para un aviso temporal: horario especial, obras, una fecha límite. Ocúltala en vez de borrarla cuando pase, y así queda lista para la próxima.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `text` | text | sí |  |
| `link_label` | text |  |  |
| `link_url` | text |  |  |
| `tone` | select |  | `info` · `aviso` · `urgente` |

Por defecto: `{"tone":"info"}`

### `prose` — Texto (v1)

Un bloque de texto con formato: titular opcional y cuerpo enriquecido. El comodín para todo lo que no encaja en un bloque con forma propia.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text |  |  |
| `body` | richtext | sí |  |
| `width` | select |  | `estrecho` · `normal` |

Por defecto: `{"width":"normal"}`

### `split` — Texto e imagen (v1)

Media pantalla de texto y media de imagen. Alternar el lado en bloques consecutivos da ritmo a una página larga.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text | sí |  |
| `body` | richtext |  |  |
| `image` | image |  |  |
| `side` | select |  | `derecha` · `izquierda` |
| `cta_label` | text |  |  |
| `cta_url` | text |  |  |

Por defecto: `{"side":"derecha"}`

### `features` — Prestaciones (v1)

Rejilla de tarjetas cortas, cada una con icono, titular y una frase. Para enumerar servicios o características. El orden no significa nada: si es un proceso, usa Pasos.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text |  |  |
| `intro` | textarea |  |  |
| `items` | repeater |  |  |
| `columns` | select |  | `2` · `3` · `4` |

Por defecto: `{"columns":"3"}`

### `steps` — Pasos (v1)

Secuencia numerada. Úsala sólo cuando el orden signifique algo de verdad — un proceso, un cómo funciona. Para una lista sin orden, usa Prestaciones.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text |  |  |
| `items` | repeater |  |  |

### `collection` — Listado de contenido (v1)

Muestra los hijos publicados de otra página: las últimas noticias del blog, los proyectos del portfolio, los servicios. Es un solo bloque para todos esos casos porque lo único que cambia es de qué página cuelgan. Se actualiza solo al publicar.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text |  |  |
| `parent` | relation | sí |  |
| `limit` | number |  |  |
| `layout` | select |  | `rejilla` · `lista` |
| `show_image` | select |  | `sí` · `no` |
| `more_label` | text |  |  |

Por defecto: `{"limit":6,"layout":"rejilla","show_image":"sí"}`

### `gallery` — Galería (v2)

Imágenes en rejilla, mosaico o carrusel, con ampliación al pulsar. Para obra hecha, instalaciones o producto. Si son logotipos de clientes, usa Logotipos, que los iguala de tamaño y los apaga para que no compitan con el contenido.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text |  |  |
| `images` | gallery |  |  |
| `layout` | select |  | `rejilla` · `mosaico` · `carrusel` |
| `columns` | select |  | `2` · `3` · `4` |
| `lightbox` | select |  | `sí` · `no` |

Por defecto: `{"layout":"rejilla","columns":"3","lightbox":"sí"}`

### `logos` — Logotipos de clientes (v2)

Franja de logotipos de clientes, proveedores o certificaciones, igualados de altura para que ninguno domine. Es prueba social de un vistazo, sin ocupar media pantalla. Para fotos de obra o producto usa Galería, que las muestra a tamaño completo.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text |  |  |
| `images` | gallery |  |  |
| `tone` | select |  | `apagado` · `a color` |

Por defecto: `{"tone":"apagado"}`

### `stats` — Cifras (v1)

Tres o cuatro números grandes con su etiqueta. Sólo funciona con cifras concretas y comprobables; con datos vagos resta credibilidad en vez de sumarla.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text |  |  |
| `items` | repeater |  |  |

### `quotes` — Testimonios (v2)

Citas de clientes con nombre, cargo y foto. En rejilla se leen todas de golpe; en carrusel ocupan menos y pueden pasar solas. Una sola cita se pinta grande.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text |  |  |
| `items` | repeater |  |  |
| `layout` | select |  | `rejilla` · `carrusel` |
| `autoplay` | select |  | `no` · `sí` |

Por defecto: `{"layout":"rejilla","autoplay":"no"}`

### `team` — Equipo (v1)

Fichas de personas con foto, nombre y cargo. En una pyme suele ser el bloque que más se mira: pon fotos reales, no de banco de imágenes.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text |  |  |
| `items` | repeater |  |  |

### `faq` — Preguntas frecuentes (v1)

Lista de preguntas y respuestas plegables. Es también la fuente del JSON-LD FAQPage, así que escribe preguntas tal y como las buscaría alguien.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text |  |  |
| `items` | repeater |  |  |

### `pricing` — Precios (v1)

Planes en columnas, con precio, lista de lo que incluye y botón. Marca uno como destacado para guiar la elección; marcar todos equivale a no marcar ninguno.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text |  |  |
| `intro` | textarea |  |  |
| `plans` | repeater |  |  |

### `cta` — Llamada a la acción (v1)

Franja de cierre con un titular corto y un botón. Pensada para el final de una página de servicio o una landing.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text | sí |  |
| `text` | textarea |  |  |
| `button_label` | text | sí |  |
| `button_url` | text | sí |  |
| `tone` | select |  | `claro` · `oscuro` · `color` |

Por defecto: `{"tone":"color"}`

### `contact` — Formulario de contacto (v1)

Formulario cuyos campos, validaciones y correos defines tú. Los mensajes llegan a la bandeja del backoffice y se avisa por correo. Los campos que declares aquí son los únicos que el servidor acepta, así que quitar uno lo deja de admitir de inmediato.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `title` | text |  |  |
| `text` | textarea |  |  |
| `fields` | formfields |  |  |
| `submit_label` | text |  |  |
| `consent_text` | textarea |  |  |
| `success_message` | textarea |  |  |
| `notify_email` | text |  |  |
| `notify_subject` | text |  |  |
| `notify_body` | textarea |  |  |
| `autoreply` | select |  | `no` · `sí` |
| `autoreply_subject` | text |  |  |
| `autoreply_body` | textarea |  |  |

Por defecto: `{"title":"Hablemos","submit_label":"Enviar mensaje","consent_text":"He leído y acepto la política de privacidad y el tratamiento de mis datos para responder a esta consulta.","success_message":"Gracias, hemos recibido tu mensaje. Te respondemos en menos de 24 horas.","notify_subject":"Nuevo mensaje desde {{_sitio}}","notify_body":"Nuevo mensaje desde {{_pagina}} ({{_url}}), el {{_fecha}}.\n\n{{_respuestas}}","autoreply":"no","autoreply_subject":"Hemos recibido tu mensaje","autoreply_body":"Gracias por escribirnos. Hemos recibido tu mensaje y te respondemos lo antes posible.\n\nEsto es lo que nos has enviado:\n\n{{_respuestas}}\n\nUn saludo,\n{{_sitio}}","fields":[{"key":"nombre","label":"Nombre","type":"text","required":"sí","width":"half"},{"key":"email","label":"Correo electrónico","type":"email","required":"sí","width":"half"},{"key":"telefono","label":"Teléfono","type":"tel","width":"half"},{"key":"mensaje","label":"Cuéntanos qué necesitas","type":"textarea","required":"sí"}]}`

### `legal` — Documento legal (v1)

Aviso legal, política de privacidad o política de cookies, generados a partir de los datos de empresa de Ajustes. La tabla de cookies se deriva de los trackers configurados, así que añadir un pixel la actualiza sola — que es la parte que nadie mantiene a mano.

| campo | tipo | obligatorio | opciones / nota |
|---|---|---|---|
| `document` | select | sí | `aviso-legal` · `privacidad` · `cookies` |
| `show_disclaimer` | select |  | `sí` · `no` |

Por defecto: `{"document":"aviso-legal","show_disclaimer":"sí"}`

