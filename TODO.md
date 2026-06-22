# TODO — sASTRe

Estado del proyecto a fecha 22 Jun 2026. Rama activa: `dev`.

---

## 🔴 Tu parte — requiere acción manual

### Infraestructura

- [ ] **Aplicar migración `0003` en Turso**
  La columna `integrations` (para la Resend API key y el from) no existe aún en la DB de producción.
  Dos opciones:
  ```bash
  # Opción A — con .env local
  TURSO_DATABASE_URL=libsql://...
  TURSO_AUTH_TOKEN=...
  npm run db:migrate
  ```
  ```sql
  -- Opción B — directo en la consola de Turso
  ALTER TABLE settings ADD COLUMN integrations text DEFAULT '{}';
  ```

- [ ] **Configurar variables de entorno en Cloudflare**
  Asegúrate de que estas vars están en el dashboard de Cloudflare Workers / Pages:
  - `TURSO_DATABASE_URL`
  - `TURSO_AUTH_TOKEN`
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET_NAME`
  - `R2_PUBLIC_URL`

- [ ] **Configurar Resend API key y dirección de envío desde el backoffice**
  Una vez aplicada la migración:
  `/admin/settings` → sección "Integraciones" → pegar la key de [resend.com/api-keys](https://resend.com/api-keys)
  y el `from` verificado en [resend.com/domains](https://resend.com/domains).
  Necesario para que el magic link funcione. El `from` y la key se leen desde la DB, no del `.env`.

- [ ] **Verificar dominio en Resend**
  Formato: `Nombre <correo@tudominio.com>`. Verifica el dominio en [resend.com/domains](https://resend.com/domains).

---

## 🟡 Mi parte — pendiente de código

### Funcionalidad

- [x] **Drag & drop entre niveles en el árbol de nodos** ✅
  `NodeTree.vue` usa un `<VueDraggable>` por nivel con `data-parent-id` para detectar el contenedor destino.
  Al soltar, envía `reorder` con el `parentId` correcto y la `position` en el nuevo nivel.
  La acción `nodes.reorder` recalcula `path` del nodo movido y de todos sus descendientes, y verifica permisos de `edit`.

- [x] **Ocultar pestaña Magic link si no hay Resend key** ✅
  `login.astro` lee `settings.integrations` en el servidor; la pestaña solo aparece si hay `resendApiKey` + `resendFrom` configurados.

- [x] **Bootstrap automático en middleware** ✅
  `middleware.ts` crea `site_default` + roles básicos (admin, editor, colaborador) si no existen en la DB. Ya no hace falta correr el seed manualmente para que el sistema arranque.

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
