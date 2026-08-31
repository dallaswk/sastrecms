---
name: contenido-de-sitio
description: Llenar o rehacer el contenido de un sitio de sASTRe —páginas, bloques, menús, tema y datos de empresa— con un guion idempotente que escribe en la base del inquilino. Úsalo cuando pidan sembrar, montar, ampliar o rehacer la web de un cliente, meter contenido de ejemplo o de demostración, o cambiar los colores y la navegación de un sitio existente.
---

# Contenido de un sitio

Un sitio de sASTRe es contenido en una base de datos, no ficheros: no hay plantillas que
tocar ni `build` que lanzar. Llenar una web es escribir nodos con sus bloques, y esto va de
hacerlo con un guion que se puede volver a lanzar mientras se afina el texto.

## Antes de nada: ¿guion o preset?

| | Guion (`scripts/<sitio>.ts`) | Preset (`src/lib/presets/defs/`) |
|---|---|---|
| Para | **Un** sitio concreto, con su marca | Un **sector**: el punto de partida de cualquier cliente de ese ramo |
| Contiene | Nombres, precios, opiniones, datos reales o ficticios de ese negocio | Texto genérico, editable, sin prueba social inventada |
| Se aplica | Tantas veces como haga falta, encima de lo que hay | Una vez, a un sitio nuevo, y falla si ya hay contenido |

Si te piden llenar la web de un cliente, es un guion. Si te piden «que las clínicas nuevas
empiecen así», es un preset — y entonces léete `src/lib/presets/types.ts` y añade la
declaración al registro, que `registry.test.ts` valida sola.

## El flujo

1. **Averigua a qué sitio va.** Los inquilinos y sus bases están en el plano de control:
   ```bash
   npx tsx -e 'import {createControlDb} from "./src/db/control-client"; const d=createControlDb(process.env.CONTROL_DATABASE_URL!); console.table(await d.query.tenants.findMany({columns:{slug:true,name:true,status:true,databaseUrl:true}}))'
   ```
   El `slug` es lo que va en `tenant:`. Sin `tenant`, se escribe en la base por defecto.

2. **Copia la plantilla** de este skill (`plantilla.ts`) a `scripts/<sitio>.ts`, o parte de
   `scripts/clinica.ts`, que es el ejemplo completo: 18 páginas, tipo de contenido propio,
   formulario, blog y legales.

3. **Declara el contenido.** Todo el guion es un objeto `Contenido`; la maquinaria vive en
   `scripts/lib/site-seed.ts` y no hay que tocarla. Los campos de cada bloque están en
   `referencia-bloques.md`, aquí al lado.

4. **Simula antes de escribir.** `npx tsx scripts/<sitio>.ts --dry` enseña qué crearía,
   qué actualizaría y qué entradas de menú no encuentran destino.

5. **Escribe y comprueba en el navegador.** El sitio se sirve por dominio, así que hay que
   pedirlo con su `Host`:
   ```bash
   npx tsx scripts/<sitio>.ts
   npx astro dev status || npm run dev          # el servidor se demoniza; no lo mates
   curl -s -o /dev/null -w "%{http_code}\n" -H "Host: <dominio>" http://localhost:4321/
   ```
   Comprueba **una página de cada clase**: la portada, una ficha hija, el formulario y un
   legal. Un 200 no significa que el bloque haya pintado: busca una frase concreta del
   texto en el HTML.

## Lo que no se puede saltar

- **`index` es la portada**, en `/`. No existe `index.astro` ni una página llamada «inicio»
  colgando de la raíz.
- **Los padres se declaran antes que los hijos.** La ruta sale de la jerarquía.
- **Una `relation` se declara con el slug** de otra página del mismo guion, nunca con un id.
- **Los ids de bloque son deterministas** (`sec_<pagina>_<n>`) y no se tocan: si cambiasen
  en cada pasada, el historial de revisiones compararía cosas distintas.
- **La clave de un campo es inmutable.** El sembrador *añade* campos a un tipo que ya
  existe, nunca reescribe el esquema: renombrar una clave deja huérfano el contenido que la
  usaba. Se cambia la etiqueta, no la clave.
- **Las imágenes se declaran en `images` y se referencian con `@clave`.** Un campo `image`
  o `gallery` guarda la *URL* del archivo, no su id, y esa URL no existe hasta que el
  archivo está subido. Por eso el contenido escribe `image: "@portada"` y el sembrador lo
  cambia por la URL después de descargar la foto y registrarla en la biblioteca:

  ```ts
  images: [{ key: "portada", url: "https://…", alt: "Qué se ve en la foto", credit: "Pexels · 105861" }],
  // y en el bloque:  image: "@portada"   ·   images: ["@portada", "@obrador"]
  ```

  El `alt` es obligatorio en la declaración a propósito. Las fotos se descargan en cada
  instalación nueva en vez de guardarse en el repositorio, y aterrizan en `public/uploads`,
  que es el almacén **de desarrollo**: en producción los medios viven en R2 y se suben por
  el backoffice. Sin fotos, deja los campos vacíos y **no pongas galería**: una galería
  vacía es un bloque en blanco.
- **Fotos de banco, con criterio.** Pexels y similares valen para producto, local y
  ambiente. No valen como retrato de una persona con nombre: poner una cara de banco de
  imágenes bajo «Marisa Sol, maestra panadera» convierte una demostración en un engaño.
- **Los legales se generan de `business`.** Las tres páginas llevan un bloque `legal` y su
  texto sale de los datos de empresa: sin ellos, el documento sale con huecos.
- **Nada de prueba social inventada en un sitio real.** Opiniones, logotipos de clientes y
  cifras sin respaldo se dejan vacíos o `hidden: true` hasta que haya material de verdad;
  es lo primero que alguien comprueba. En una demo declarada como tal, invéntalo, pero
  usa `.example` en los correos y `+34 960 000 000` de teléfono para que nadie reciba
  llamadas de un sitio de mentira.
- **La papelera, no el `DELETE`.** Lo que sobra se declara en `retire: ["/ruta-vieja"]`.

## Si los colores no se aplican

La paleta se sirve en `/theme.css` y se compara con la de daisyUI. Mira primero la hoja
(`curl -H "Host: <dominio>" http://localhost:4321/theme.css`): si los valores están bien y
la página no los usa, es cascada o caché del navegador —la URL lleva una huella del tema,
así que un cambio que no toque los colores no la cambia y hace falta recargar sin caché.

## Comprobaciones que ya existen

- `npm test` valida los presets contra el registro de bloques y el validador real del
  servidor. Un guion **no** pasa por ahí: su red es `--dry` más la comprobación por HTTP.
- `parseSections` (`src/lib/sections/validate.ts`) es lo que decide qué sobrevive de un
  bloque. Si un campo desaparece al pintar, empieza por ahí.
