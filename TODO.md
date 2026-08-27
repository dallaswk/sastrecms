# TODO — sASTRe

Estado del proyecto a fecha 17 Ago 2026. Rama activa: `dev`.

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
