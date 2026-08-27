# TODO — sASTRe

Estado del proyecto a fecha 27 Ago 2026. Rama activa: `dev`. Astro 7.2.8.

---

## 🔴 Tu parte — requiere acción manual

### Infraestructura

- [ ] **Crear un nuevo sitio con el wizard interactivo** ⭐ recomendado
  Ejecuta el wizard desde el repositorio template y te creará un directorio nuevo listo para usar:
  ```bash
  npm run create-site
  ```
  El wizard guía paso a paso: crea un directorio `sastre-<nombre>`, copia el template, instala dependencias, crea la base de datos (Turso Cloud o local), aplica migraciones, ejecuta seed, genera el `.env`, configura R2, Resend y el primer admin, inicializa Git y opcionalmente despliega en Cloudflare Pages.
  También existe el comando utilitario dentro del proyecto creado:
  ```bash
  npm run create-admin <email> <password>
  ```

- [ ] **Aplicar migración `0003` en Turso** (solo si no usas el wizard)
  La columna `integrations` (para la Resend API key y el from) no existe aún en la DB de producción.
  ```bash
  TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:migrate
  ```
  o directo en la consola de Turso:
  ```sql
  ALTER TABLE settings ADD COLUMN integrations text DEFAULT '{}';
  ```

- [ ] **Configurar variables de entorno en Cloudflare** (si no usas el wizard)
  Asegúrate de que estas vars están en el dashboard de Cloudflare Workers / Pages:
  - `TURSO_DATABASE_URL`
  - `TURSO_AUTH_TOKEN`
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET_NAME`
  - `R2_PUBLIC_URL`

- [ ] **Configurar Resend API key y dirección de envío**
  Desde el wizard o manualmente en `/admin/settings` → sección "Integraciones".
  - Key: [resend.com/api-keys](https://resend.com/api-keys)
  - From: verificado en [resend.com/domains](https://resend.com/domains)
  - Formato: `Nombre <correo@tudominio.com>`
  Necesario para que el magic link funcione. El `from` y la key se leen desde la DB, no del `.env`.

---

## 🟡 Mi parte — pendiente de código

### Funcionalidad

- [x] **Fase A del plan: dos fallos vivos y un desbloqueo** ✅ *(27 Ago 2026)*

  🔴 **Subir y borrar medios estaba roto en producción.** `media.ts` leía
  `context.locals.runtime?.env?.R2_BUCKET`, pero en el adaptador v14 ese getter **lanza**
  (`cf-helpers.js:30`, *"has been removed in Astro v6"*), y el `?.` no protege contra un
  throw. En local nunca se vio porque con el adaptador Node `locals.runtime` es
  `undefined` y cortocircuita. El binding ahora se resuelve en el middleware, que ya
  cargaba bien el entorno, y viaja en `locals.r2`. **Verificado en `workerd`**: subida y
  borrado reales contra el bucket R2 local, cero errores en el worker.

  - **Favicon**: no existía `public/`, pero los dos layouts pedían `/favicon.svg`. Todas
    las páginas de todos los sitios daban 404 en el favicon.
  - **Una consulta menos por petición**: `sites` + `settings` en un `leftJoin`. Es
    `leftJoin` y no `innerJoin` porque un sitio puede existir antes de que
    `ensureBootstrap` escriba sus settings, y perder la fila del sitio en esa ventana se
    llevaría por delante `defaultLocale`. De paso **`locals.site` ya llega a las rutas
    públicas**, que es prerrequisito del `hreflang x-default`.
  - **`tsc` en cero por primera vez.** Los cuatro errores de `media.ts` se fueron con el
    arreglo; los tres de zod eran reales: `z.record()` pide clave y valor en zod 4, y el
    `z` de `astro:schema` es sólo un valor, así que `z.ZodType` necesita importar el tipo
    aparte. Ambas formas se comportan igual en runtime, comprobado.

- [x] **El worker, ejecutado de verdad en `workerd`** ✅ *(27 Ago 2026)*
  Era lo último sin probar, y **había un fallo de despliegue esperando**.

  🔴 **`wrangler.toml` era config de Pages y el adaptador v14 construye un Worker.**
  `@astrojs/cloudflare` 14 genera un binding `ASSETS` para los estáticos, y ese nombre
  está reservado en proyectos Pages, así que wrangler rechazaba la config generada de
  plano:

  ```
  ✘ [ERROR] Processing dist/server/wrangler.json configuration:
      - The name 'ASSETS' is reserved in Pages projects.
  ```

  Se ha quitado `pages_build_output_dir`; el adaptador rellena `main` y `assets` al
  escribir `dist/server/wrangler.json`. **Ojo, esto cambia el modelo de despliegue de
  Pages a Workers**: el proyecto, el comando de deploy y dónde se ponen las variables de
  entorno pasan a ser los de Workers. Es consecuencia de subir el adaptador de 13 a 14, y
  no se veía ni en `dev` ni compilando — sólo al ejecutar.

  Cómo se probó sin desplegar: `workerd` no tiene sistema de ficheros, así que
  `file:./local.db` no vale dentro del worker. Se levantó un **servidor HTTP mínimo que
  habla el protocolo Hrana** de libsql sobre `local.db`, se validó primero desde Node con
  las mismas consultas de la app (joins, columnas JSON, booleanos) y luego se apuntó el
  worker a él. Es andamiaje de pruebas, no Turso, pero es el mismo protocolo por el que
  habla producción.

  Verificado dentro de `workerd`: rutas públicas y 404, sitemap, estáticos por el binding
  `ASSETS`, login con Better Auth (incluido el 401 de contraseña incorrecta, que ejercita
  el hash), las siete páginas de admin con sesión, las actions, el ciclo completo de
  mutación con escrituras reales, el MCP (que usa `crypto.subtle` para el hash del token),
  los guards de permisos y las islas Vue.

  **Y la sesión sobrevive al redespliegue**, que era la otra incógnita. Con rebuild e
  isolate nuevos la cookie sigue valiendo (200); con el secreto cambiado cae (302 +
  Unauthorized). El control negativo es lo que da valor al positivo: confirma que la
  validez de la sesión depende del secreto, y por tanto que pasarlo explícito es lo que
  la garantiza en Workers.

  *(El primer intento del control negativo dio un falso positivo porque wrangler no había
  recargado `.dev.vars`; hizo falta reiniciar del todo.)*

- [x] **Astro 7.2.8** ✅ *(27 Ago 2026)*
  Levantada la restricción de "quedarse en Astro 6": era por la beta, y Astro 7 salió estable.
  **No existe Astro 7.3** — el `latest` del registro es `7.2.8` y la rama 7.x se para ahí.

  - `astro` 6.4.8 → **7.2.8**
  - `@astrojs/cloudflare` 13.7.0 → **14.2.5** (peer `astro ^7.2.0`)
  - `@astrojs/node` 10.1.4 → **11.1.4** (peer `astro ^7.2.1`)
  - `@astrojs/vue` 6.0.1 → **7.0.2** (peer `astro ^7.0.0`)
  - `wrangler` → **^4.125.0**, que es lo que pide el adaptador de Cloudflare 14

  Instala sin `--legacy-peer-deps`. Cero cambios de código: middleware, Astro Actions,
  islas Vue, MCP y renderers funcionan tal cual.

  **Cambio de comportamiento importante:** `astro dev` **se demoniza** en Astro 7.
  `npm run dev` devuelve el control al momento y el servidor sigue vivo en segundo plano.
  Se maneja con `npx astro dev status | logs | stop`. Si matas el proceso de `npm` en vez
  de usar `astro dev stop`, el servidor sobrevive y el siguiente arranque coge el puerto
  4322 en lugar del 4321 — pasó durante esta actualización.

  **Build de producción verificado** con los dos adaptadores:
  Cloudflare 14 en 6 s y Node en 1,4 s — este último es la prueba de que el fix de
  `SASTRE_ADAPTER` sirve, porque antes `astro build` siempre inferÍa Cloudflare. El build
  de Node se arrancó y se le pasó la batería entera: rutas públicas, las ocho páginas de
  admin, las actions, el ciclo de mutación con reescritura de `path`, el MCP y los módulos
  de las islas servidos desde `dist/client/_astro` con nombre hasheado.

  Confirmado también que **la trampa de la caché de Vite sigue viva en Vite 8**: el build
  deja 2 MB en `node_modules/.vite/deps`. Hay que borrarlo antes de volver a `dev`.

  Verificado: 84 tests, `tsc` en los mismos 7 errores preexistentes, las 15 rutas con
  admin y editor (incluidos los 302 del editor), las ocho actions, el ciclo completo de
  mutación, el MCP, las cinco islas Vue con sus módulos, y la hoja de estilos generada
  **byte a byte idéntica** a la de Astro 6 (119571 bytes, mismo sha256).

  Anécdota útil: la comparación de CSS falló al principio por 37 bytes, y el culpable era
  la palabra "invisible" en un comentario que había escrito en `auth.ts` — el escáner de
  contenido de Tailwind la tomó por un nombre de clase y emitió `.invisible`.

- [x] **Grafo de dependencias consistente y adaptador explícito** ✅ *(27 Ago 2026)*
  `npm install` ya funciona **sin `--legacy-peer-deps`**. La auditoría decía dos peers
  incumplidos; eran cuatro, y cada uno tapaba al siguiente:

  - `@astrojs/node` 9 → **10.1.4** (peer `astro ^6.3.0`; la 9.x pedía `^5.17.3` y la 11.x
    ya apunta a Astro 7). De paso desaparece el aviso de `entrypointResolution` en cada
    arranque.
  - `@astrojs/vue` 5 → **6.0.1** (peer `astro ^6.0.0`). No estaba en la auditoría: apareció
    sólo cuando npm llegó lo bastante lejos para reportarlo.
  - `@astrojs/tailwind` **eliminado**. Su peer se queda en Astro 5 y lo único que hacía era
    cargar `postcss.config`, que Vite ya hace solo. Ahora hay `postcss.config.mjs`.
    **Tailwind sigue en 3.4 y daisyUI en 4.12**: es un cambio de empaquetado, no una
    actualización. Comprobado capturando la hoja de estilos generada antes y después:
    119571 bytes, mismo sha256.
  - `drizzle-orm` 0.42 → **0.45.2** y `drizzle-kit` → `^0.31.4`, que es lo que `better-auth`
    1.6 pide como peer opcional.

  **Corrección a la auditoría:** `@astrojs/tailwind` no está marcado como deprecado en npm.
  Su problema es el rango de peers, no la deprecación. Lo dije mal.

  `astro.config.ts` además: el adaptador se elige con `SASTRE_ADAPTER` si está definida, y
  si no cae en la inferencia anterior — leer `process.argv` hacía imposible que
  `astro build` apuntara a Node, o sea que lo único que no se podía buildear era lo que
  corre el dev server. Y fuera `platformProxy`: `@astrojs/cloudflare` v13 no acepta esa
  opción, así que no hacía nada, y era uno de los errores de `tsc`.

- [x] **Secreto de Better Auth obligatorio, y el choque de `index` explicado** ✅ *(27 Ago 2026)*

  - `createAuth` lanza si no recibe secreto. Better Auth caía en
    `process.env.BETTER_AUTH_SECRET`, que en Workers no se rellena desde los bindings con
    `compatibility_date` < 2025-04-01, y ese fallo es **invisible**: las sesiones se firman
    con lo que derive y dejan de validar tras un redespliegue. Ahora el único fallo que
    sólo se veía en producción salta al arrancar, nombrando la variable.
  - Auditados los cinco llamadores de `computePath`: **nada depende de la cadena
    `/index`**, y el wizard ya escribía `slug: "index"` con `path: "/"`, así que el cambio
    alinea la función con los datos. Pero sí salió un cambio de comportamiento real: un
    segundo nodo raíz con slug `index` antes caía en `/index` y ahora choca con la portada,
    diciendo `Path "/" already exists` — que no tiene sentido para quien escribió `index`.
    La action y la herramienta MCP ahora lo explican.
  - `index` anidado **está reservado** *(cerrado el 27 Ago 2026)*. Antes era un segmento
    normal y producía `/blog/index`: una URL real pero inútil, porque quien buscaba "la
    portada del blog" acababa con una página que nadie visita mientras `/blog`, que es el
    archivo, seguía ignorándola. `reservedSlugError()` en `@lib/id` lo rechaza en `create`
    y al renombrar, tanto por action como por MCP, con un mensaje que explica el porqué.
    Sigue permitido crear la portada de un idioma que aún no la tiene (probado con
    `locale: "en"` → `/en`), y duplicarla da el mensaje de portada existente.

- [x] **Permiso de lectura en los endpoints que faltaban** ✅ *(27 Ago 2026)*
  Tras la auditoría, el MCP filtraba por `view` pero la web no: la misma cuenta recibía
  inventarios distintos según por qué puerta entrase.

  - `viewableContentTypeIds()` vive ahora en `@lib/permissions` y la usan las dos
    superficies. Antes era una función privada de `mcp.ts`.
  - `nodes.list` y `nodes.listForPicker` filtran por `view`; `nodes.get` lo exige.
  - `media.*` — los medios no tienen tipo de contenido, así que la matriz rol × tipo no
    dice nada de ellos. La regla que sí aplica es `requireSiteRole()`: hace falta tener
    un rol en el sitio. Antes bastaba con estar autenticado, así que cualquier cuenta con
    login leía la mediateca entera.
  - El árbol de `/admin/content` filtra igual. Un nodo cuyo tipo no puedes ver se oculta
    **pero sus hijos suben a ocupar su sitio**: esconder la rama entera dejaría
    inalcanzable contenido que sí puedes ver. Un editor con permiso sólo sobre Posts ve
    los dos posts en la raíz, aunque cuelguen de una página que no ve.

  Verificado con tres perfiles (admin, editor limitado a Posts, y autenticado sin rol)
  que web y MCP dan exactamente la misma respuesta a la misma cuenta.

  **Sigue abierto:** `media.delete` y `media.deleteFolder` sólo comprueban que tengas rol,
  así que un colaborador puede borrar archivos subidos por otro. Restringirlo a admin o
  a quien lo subió es un cambio de comportamiento que conviene decidir aparte.

- [x] **`SITE_ID` centralizado (preparación para multi-tenant)** ✅ *(27 Ago 2026)*
  Estaba hardcodeado como `const SITE_ID = "site_default"` en catorce ficheros, más dos
  literales sueltos. Ahora el sitio se resuelve una vez por petición y viaja en `locals`.

  - `src/lib/site.ts` — `DEFAULT_SITE_ID` y `resolveSiteId(db, host)`. **Este es el único
    punto que hay que tocar en la fase SaaS**: buscar el host contra una columna
    `sites.host` (o el control plane) y devolver ese id. Es `async` a propósito, para que
    la firma no cambie cuando necesite E/S.
  - `middleware.ts` resuelve el id y lo publica en `locals.siteId`. Todo lo que atiende
    peticiones lee de ahí; sólo el bootstrap (seed, wizard, `ensureBootstrap`) nombra la
    constante directamente.
  - `locals.site` — la fila del sitio (`defaultLocale`, `locales`), cargada **sólo en
    `/admin` y las APIs**, que son las que la necesitan. Eso elimina de paso seis
    consultas: tres en `nodes.ts` (una por mutación), dos en `mcp.ts` y una en
    `/admin/content`. Las páginas públicas no la cargan y siguen igual de baratas.

  Cuidado al tocar esto: si `locals.site` dejara de llegar a las actions,
  `computePath` recibiría `defaultLocale: undefined` y **el prefijo de idioma
  desaparecería sin dar error**. Verificado explícitamente que crear en `en` sigue dando
  `/en/…` tanto por action como por MCP.

- [x] **Tests unitarios (Vitest)** ✅ *(27 Ago 2026)*
  74 tests sobre la lógica pura, que hasta ahora sólo estaba verificada a mano.
  `npm test` / `npm run test:watch`.

  - `src/lib/id.test.ts` — `computePath` con sus casos de locale, `slugify` con acentos
    castellanos, `generateId` sin colisiones.
  - `src/components/admin/nodeTreeContext.test.ts` — `parseNodes`, `flatten`,
    `diffAgainst`, `reparentedIds`, `recomputePaths`. Incluye un bloque que comprueba que
    **`recomputePaths` y `computePath` dan el mismo resultado**: el árbol pinta rutas que
    el servidor nunca devuelve (`reorder` sólo contesta `{ ok: true }`), así que si las
    dos implementaciones divergen el backoffice enseña rutas que no existen.
  - `src/lib/analytics.test.ts` — las formas de los IDs contra ocho payloads de inyección
    reales, no sólo valores válidos.
  - `src/lib/permissions.test.ts` — contra una **base libSQL en memoria con las
    migraciones aplicadas**, no un mock: parte del filtrado de `checkPermission` ocurre en
    SQL (`or(contentTypeId = x, contentTypeId is null)`) y es justo la parte más fácil de
    reimplementar mal en un doble de pruebas.

  Dos cambios que salieron de escribirlos:

  - **`checkPermission` ya no depende del orden de filas.** Cuando no había fila específica
    cogía `perms[0]`, así que con dos comodines para el mismo rol el permiso efectivo lo
    decidía el orden que devolviera SQLite. Nada lo impide: no hay índice único en
    `(roleId, contentTypeId)` y `setPermission` hace buscar-y-luego-insertar. Ahora una fila
    específica sigue ganando al comodín, y entre varios comodines se combinan de forma
    aditiva. El test lo reprodujo antes del arreglo.
  - **Las formas de los IDs de analytics viven en `src/lib/analytics.ts`.** Estaban
    duplicadas en `settings.ts` y en `BaseLayout.astro`, que es exactamente la clase de
    duplicación que se desincroniza. Una regla, dos puntos de aplicación, un test.

- [x] **Auditoría de seguridad y permisos** ✅ *(27 Ago 2026)*
  Diez hallazgos de la auditoría de código, todos verificados contra el servidor en local.

  **Crítico**
  - `requireAdmin()` en `users.ts` y `permissions.ts` sólo comprobaba que hubiera sesión.
    Cualquier colaborador podía llamar `users.assignRole` y hacerse admin, o reescribir la
    matriz de permisos. Ahora existe `isAdmin()`/`requireAdmin()` en `@lib/permissions` y
    ambos módulos lo usan.
  - **XSS almacenado** en toda la web pública: `settings.update` no exigía admin y
    `BaseLayout` interpolaba los IDs de analytics sin escapar dentro de `<script>`
    (`hjid:${analytics.hotjar}`). Dos capas: validación por regex en el esquema Zod, y
    saneado en el layout para los valores que ya estuvieran guardados.
  - El endpoint MCP no llamaba a `checkPermission` en ninguna de sus once herramientas.
    Ahora un token hereda exactamente los permisos de su dueño; `get_settings` y
    `update_settings` exigen admin, y los listados filtran por permiso de `view`.

  **Alto**
  - `nodes.update` permitía publicar escribiendo `status`, saltándose el permiso
    `publish`. Cualquier transición de estado lo exige ahora.
  - `media.upload` construía la URL pública con un host `workers.dev` inventado: todo lo
    subido quedaba con URL rota. Lee `R2_PUBLIC_URL` y genera un solo id para la fila y
    la clave de storage.
  - Desactivar un usuario ponía `emailVerified = false`, que no impide el login. Nueva
    columna `user.disabled` (migración `0005`) que el middleware aplica, borrado de sus
    sesiones activas, invalidación de sus tokens MCP y acción `reactivate`. La UI de
    `/admin/users` separa "Verificado" de "Estado"; antes el botón "Activar" llamaba a
    `deactivate` y no hacía nada.

  **Medio**
  - **Prefijo de locale en `path`.** El índice único es `(siteId, path)` sin idioma, así
    que dos traducciones con el mismo slug chocaban. El idioma por defecto conserva la
    ruta desnuda y el resto se namespacea: `/contacto` (es) y `/en/contacto` (en).
    `computePath` recibe `locale` y `defaultLocale`; `recomputePaths` en el cliente
    replica la misma regla y `[...slug].astro` propaga el idioma al `<html lang>`.
    Ojo: `computePath` ya devuelve `/` para el slug `index`, en vez de `/index`.
  - `reorder` no validaba ciclos: por API se podía mover un nodo dentro de su propio
    subárbol y dejarlo inalcanzable. Rechazado, y ahora también actualiza `updatedAt`
    para que el sitemap refleje los movimientos.
  - El middleware hacía 3-4 round trips a Turso por request, incluidas páginas públicas
    anónimas. `ensureBootstrap` corre una vez por isolate, `getSession` sólo en `/admin`
    y las APIs, y los settings viajan en `locals` en vez de consultarse otra vez en
    `BaseLayout` y en el resolver.
  - Better Auth recibe `secret` y `baseURL` explícitos. Los buscaba en `process.env`, que
    en Workers no se rellena desde los bindings con `compatibility_date` < 2025-04-01.

  Efecto colateral deliberado: `/admin/users`, `/admin/permissions` y `/admin/settings`
  redirigen a `/admin` si no eres admin, y sus enlaces desaparecen del menú.

- [x] **Drag & drop entre niveles en el árbol de nodos** ✅ *(rehecho el 17 Ago 2026)*
  Los arreglos de hidratación de junio (`927c345`, `770ad33`) habían dejado el árbol sin drag & drop:
  se sustituyó `<VueDraggable>` por un `v-for` plano y quedaron `buildUpdates`/`persistUpdates`
  y el emit `reorder` sin ningún llamador. Reconstruido con esta estructura:

  - `nodeTreeContext.ts` — lógica pura y testeable: `parseNodes`, `flatten`, `diffAgainst`,
    `recomputePaths`, más el `InjectionKey` compartido.
  - `NodeTree.vue` — raíz: única dueña del estado, hace `provide()` del contexto y persiste.
  - `NodeTreeLevel.vue` — nivel recursivo con `<VueDraggable>` y `group: "sastre-nodes"`
    compartido, que es lo que permite soltar en cualquier otro nivel.

  Detalles que importan:
  - Se envían **solo los nodos que cambiaron** de `parentId` o `position`. Mandar el árbol
    entero haría que `reorder` exigiera `edit` sobre todos los tipos y un editor limitado a
    Posts no podría reordenar nada.
  - `force-fallback` mantiene a SortableJS fuera del drag nativo HTML5: las listas anidadas se
    comportan mucho mejor (el dragover del hijo no pelea con el del padre).
  - Movimiento optimista con revert: si el servidor rechaza (p. ej. `path` duplicado) el árbol
    vuelve al último estado confirmado y se muestra el error.
  - `recomputePaths` replica `computePath` en cliente porque `reorder` sólo devuelve `{ ok: true }`.
  - Un nodo sin hijos se puede desplegar igualmente para exponer una zona de drop y anidar dentro.
  - Handle de arrastre explícito (`⠿`), así los enlaces y botones de la fila siguen siendo clicables.

- [x] **Ocultar pestaña Magic link si no hay Resend key** ✅
  `login.astro` lee `settings.integrations` en el servidor; la pestaña solo aparece si hay `resendApiKey` + `resendFrom` configurados.

- [x] **Bootstrap automático en middleware** ✅
  `middleware.ts` crea `site_default` + roles básicos (admin, editor, colaborador) si no existen en la DB. Ya no hace falta correr el seed manualmente para que el sistema arranque.

- [x] **Frontend público arreglado** ✅ *(17 Ago 2026)*
  La web pública no se veía: todas las rutas devolvían 200 con el body vacío. Dos causas:

  1. `src/pages/index.astro` era un placeholder de la Phase 4 que imprimía una frase literal
     y nunca tocaba la DB. Al ser ruta más específica, tapaba a `[...slug].astro` en `/`.
     Eliminado — el resolver ya contempla el caso raíz (`path = "/"`).
  2. `BaseLayout.astro` hacía `new URL(Astro.url.pathname, Astro.site)` y `site` no está
     definido en `astro.config.ts`, así que lanzaba `Invalid URL` en **todas** las páginas
     públicas. Ahora cae a `Astro.url.origin`, igual que ya hacía `sitemap.xml.ts`.

  `site` se deja sin definir a propósito: cada despliegue de cliente tiene su dominio y no se
  conoce en build time. El origin de la request es el valor correcto detrás de Cloudflare.

  Ojo con la convención de la home: el wizard la crea con `slug: "index"` y `path: "/"`.
  Por eso `recomputePaths` sólo reescribe los subárboles que cambian de padre — un recálculo
  general la mostraría como `/index` mientras la DB dice `/`.

- [x] **Campo de contenido en los tipos base** ✅ *(17 Ago 2026)*
  En el backoffice sólo se podían editar título, slug, traducciones y SEO: **ningún tipo del
  sistema declaraba el campo que sus propios renderers pintan**. Los cuatro renderers de
  `src/components/renderers/` usan `fields.body`, pero el seed creaba Página con
  `field_schema: []` y Post/Portfolio sólo con sus campos secundarios.

  - `seed.ts` — los tres tipos base ahora incluyen `{ key: "body", type: "richtext" }`.
  - `drizzle/0004_add_body_field_to_system_types.sql` — migración de datos que añade el campo
    a las bases ya creadas (el seed usa `onConflictDoNothing`, así que re-ejecutarlo no las
    arregla). Conserva el orden y los valores de los campos existentes, y es idempotente.

  Para arreglar una instalación existente basta `npm run db:migrate`. El formulario ya sabía
  pintar `richtext` con Tiptap; sólo le faltaba el campo en el esquema.

- [x] **Versiones de Tiptap alineadas** ✅ *(17 Ago 2026)*
  `@tiptap/extension-link` y `@tiptap/pm` estaban en `^3.27.1` mientras `core`, `vue-3` y
  `starter-kit` iban en `^2.11.0`. `extension-link@3` declara peer `@tiptap/core: 3.27.1`,
  así que era un peer incumplido que funcionaba de milagro. Bajados a `^2.11.0`.
  Ojo: `npm install` en este repo necesita `--legacy-peer-deps` por el conflicto
  preexistente de `@astrojs/node@9` (pide astro ^5) con Astro 6.
  *(Resuelto el 27 Ago 2026: ver la entrada del grafo de dependencias.)*

- [x] **Árbol de contenido reactivo a permisos** ✅
  `/admin/content` calcula `edit` y `delete` por tipo de contenido y se los pasa al árbol.
  Un editor limitado a Posts ve el handle de arrastre bloqueado en las Páginas (con tooltip
  explicando por qué) y sin botones de Editar/Borrar. El botón de borrar también sale
  deshabilitado en nodos con hijos, porque la acción `nodes.delete` los rechaza.

### Entorno local de pruebas

Para levantar el CMS en local contra un SQLite de fichero, sin tocar Turso:

```bash
cat > .env <<'EOF'
TURSO_DATABASE_URL=file:./local.db
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:4321
EOF

# ⚠️ TURSO_AUTH_TOKEN debe estar AUSENTE, no vacío: drizzle-kit rechaza la cadena vacía
env -u TURSO_AUTH_TOKEN npm run db:migrate
env -u TURSO_AUTH_TOKEN npm run db:seed
env -u TURSO_AUTH_TOKEN npm run create-admin -- admin@local.test <password>
env -u TURSO_AUTH_TOKEN npm run dev
```

⚠️ **Desde Astro 7 `astro dev` se demoniza**: `npm run dev` devuelve el control al momento
y el servidor sigue vivo en segundo plano. Para manejarlo:

```bash
npx astro dev status   # ¿corriendo? en qué puerto y pid
npx astro dev logs     # los logs que antes salían por stdout
npx astro dev stop     # pararlo
```

Ojo: si matas el proceso de `npm` en vez de usar `astro dev stop`, el servidor sobrevive y
el siguiente arranque coge el puerto 4322 en vez del 4321.

En dev el adaptador es Node y las vars se leen del `.env` vía dotenv; en `build` se usa
Cloudflare y salen de `cloudflare:workers`. Lo resuelve `loadEnv()` en `middleware.ts`.

### Nice-to-have

- [ ] **Google OAuth** — añadir `socialProviders.google` en `src/lib/auth.ts` + botón en `login.astro`
- [ ] **Optimización de imágenes (paid plan)** — integrar Cloudflare Images, ImageKit o Cloudinary en la acción de upload de media
- [ ] **SaaS multi-tenant (Phase 9)** — control plane, un Turso DB por cliente

---

## ✅ Completado

- [x] Phase 0 — scaffold Astro 6 + Cloudflare + Drizzle + Better Auth + Tailwind + daisyUI + Vue
- [x] Phase 1 & 2 — data model + backoffice CRUD (login, nodos, tipos de contenido)
- [x] Phase 3 — content type builder (ACF-style) + roles
- [x] Phase 4 — frontend público: resolución por `path`, renderers por tipo, archivos
- [x] Phase 5 — subida de media a R2 + media manager UI con carpetas
- [x] Phase 6 — theming dinámico + settings + redirects (con middleware)
- [x] Phase 7 — MCP server + gestión de API tokens
- [x] Phase 8 — sitemap.xml, robots.txt, JSON-LD (Organization, BreadcrumbList, Article), hreflang
- [x] Tiptap richtext en NodeForm (bold, italic, link, listas, headings)
- [x] Media picker integrado en NodeForm (campos image y gallery)
- [x] i18n — selector de locale en NodeForm + hreflang en BaseLayout
- [x] Página `/admin/users` — listar, invitar, cambiar rol, desactivar
- [x] Página `/admin/permissions` — matriz rol × tipo de contenido, guardado automático
- [x] Guards de permisos en todas las mutations de nodos (create, edit, publish, delete)
- [x] UI reactiva a permisos: botones y status ocultos según rol
- [x] Flag `translatable` en ContentTypeBuilder (selector de locale condicionado)
- [x] Vinculación de traducciones (`translationGroupId`) desde NodeForm
- [x] Analytics y tracking — GA4, GTM, Meta Pixel, TikTok Pixel, Hotjar, GSC (desde settings)
- [x] Resend API key en settings DB (no en .env)
- [x] Magic link en login (pestaña alternativa a contraseña)
- [x] Árbol jerárquico de nodos con drag & drop para reordenar (`position`)
- [x] Upload guidelines en MediaManager
- [x] `@tiptap/extension-link` y `@tiptap/pm` instalados
