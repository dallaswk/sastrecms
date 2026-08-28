# sASTRe

**Tailored for Astro** — A fast, SEO-friendly CMS for small and medium businesses, built on Astro 7.

sASTRe lets you deploy full websites for clients in record time: a public-facing Astro site with no rebuilds on publish, a backoffice for managing content, media and settings, a unified content tree with customizable types — all without touching code — and an MCP server so content can be published via AI agents.

Designed mono-tenant today. Ready to scale to SaaS tomorrow.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Astro 7 (SSR/hybrid) with Live Content Collections |
| Mutations | Astro Actions (type-safe, reused by MCP) |
| Database | Turso (libSQL) via Drizzle ORM |
| Hosting | Cloudflare Workers |
| Auth | Better Auth + Drizzle adapter |
| Email | Resend |
| Media | Cloudflare R2 |
| Backoffice UI | Vue 3 islands + daisyUI + Tailwind |
| Rich text | Tiptap (Vue 3) |
| Drag & drop | SortableJS / vue-draggable |
| MCP server | Custom, built on Astro Actions |

> ⚠️ Astro 7 went stable and the project is on 7.2. `@astrojs/db` is deprecated — use Drizzle directly.
>
> Note that `astro dev` daemonises since Astro 7: `npm run dev` returns immediately and the
> server keeps running in the background. Use `astro dev status`, `astro dev logs` and
> `astro dev stop` to drive it.

---

## Architecture

A single Astro app in SSR/hybrid mode, deployed to Cloudflare Workers, serving three surfaces from one codebase:

```
┌─────────────────────────────────────────────────┐
│  Cloudflare Worker (Astro 7 SSR)                 │
│                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────┐ │
│  │ Public site   │ │  Backoffice   │ │   MCP    │ │
│  │ (Live Coll.)  │ │ (Vue islands) │ │ (tokens) │ │
│  └──────┬───────┘ └──────┬───────┘ └────┬─────┘ │
│         └────────┬────────┴───────────────┘       │
│                  │                                 │
│           Astro Actions (business logic)           │
│                  │                                 │
│             Drizzle ORM                            │
└──────────────────┼─────────────────────────────────┘
                   │
          ┌────────┴────────┐
          │  Turso (libSQL)  │      Cloudflare R2
          └──────────────────┘      (media)
```

- **`/`, `/[...slug]`** — Resolves each node by `path` on every request via Live Content Collections. No rebuild needed when content changes.
- **`/admin/*`** — Protected by Better Auth. All mutations via Astro Actions. Interactive parts (editor, tree, media upload) as Vue 3 islands.
- **`/mcp`** — Exposes the same Astro Actions as MCP tools, authenticated by per-user API tokens.

---

## Content model

Everything lives in a single node tree — pages, posts, portfolio items, whatever content types you define. Nodes resolve to the right component based on their `content_type`.

```ts
// content_types — customizable via the backoffice, no code required
content_types: {
  key, label, icon,
  has_archive,        // acts as a container/listing
  supports_children,
  translatable,
  is_system,          // base types (Page, Post, Portfolio) can't be deleted
  field_schema: json  // [{ key, label, type, required, options... }]
}

// nodes — the unified tree
nodes: {
  parent_id,          // null = root
  locale, translation_group_id,
  slug, path,         // cached for fast resolution
  position,           // sibling order
  status,             // draft | published | scheduled
  title,
  fields: json,       // values per content_type field_schema
  seo: json,          // meta_title, description, og_image, noindex...
  created_via,        // "web" | "mcp"
}
```

Archive pattern: a node with `has_archive = true` (e.g. "Blog") acts as a container. Its direct children are the collection items. `/blog/` resolves to the archive node; `/blog/my-post/` resolves to a Post child.

Field types (MVP): text, textarea, richtext, image, gallery, date, number, select, relation, repeater.

---

## Roles & permissions

| Role | Scope |
|---|---|
| **Admin** | Everything: content, types/fields, media, users, settings, MCP tokens |
| **Editor** | Content per `role_content_permissions` (e.g. Posts only) |
| **Collaborator** | Like Editor but typically without `can_publish` — stays in draft |

Content type management, global media, users, and settings are locked to Admin. Content access is granular per type.

---

## MCP server

Each site exposes an MCP endpoint at `/mcp`. Users generate their own tokens from **Settings → AI agent connections**.

MCP tools call the exact same Astro Actions used by the backoffice — same permissions, same business logic, no duplication. An Editor with access to Posts only can only touch Posts via MCP too. All MCP-created content is tracked with `created_via = "mcp"`.

**MVP tools:** `list_content_types`, `list_nodes`, `get_node`, `create_node`, `update_node`, `publish_node`, `delete_node`, `upload_media`, `list_media`, `search_content`, `get_settings`, `update_settings` (Admin only).

---

## SEO (included out of the box)

- Dynamic sitemap.xml and robots.txt from published nodes
- Per-node meta title, description, Open Graph
- JSON-LD (Organization, Article, BreadcrumbList)
- Automatic `hreflang` between translations
- Canonical URLs, per-node `noindex`
- Redirect management from settings

---

## Multi-language

Each node has `locale` + `translation_group_id`. The Spanish and English versions of a page are two separate nodes with their own translated slugs (`/es/sobre-nosotros`, `/en/about-us`). The `content_type.translatable` flag controls whether a type needs translation at all.

---

## Dynamic theming

daisyUI compiles themes at build time, so per-client theming works by injecting an inline `<style>` in the `<head>` on each request that overrides daisyUI CSS custom properties with the values stored in `settings.theme`. Typography uses a curated set of pairings via Astro's Fonts API.

---

## Media

- Stored in Cloudflare R2 (S3-compatible, no egress cost).
- **MVP: no automatic optimization.** Users upload already-optimized images. The backoffice shows upload guidelines (dimensions, max weight, accepted formats).
- **Future (paid plan):** third-party optimization (Cloudflare Images, ImageKit, or Cloudinary). Must be an external service or WASM-compatible — `sharp` doesn't run on Workers.
- Optional folder organization via `media_folders`.

---

## Authentication

Better Auth with Drizzle adapter (`sqlite` provider — works with Turso and D1).

- Email + password (available now)
- Magic link via Resend (available now)
- Google OAuth (later, via `socialProviders` plugin)

> ⚠️ On Cloudflare Workers: instantiate Drizzle and Better Auth **once per request** at the start of middleware. Sharing instances across requests causes intermittent connection errors.

---

## Roadmap

| Phase | What's in it |
|---|---|
| 0 | Base setup: repo, Astro 7 + Cloudflare adapter, Drizzle + Turso, Better Auth, Tailwind + daisyUI, Vue |
| 1 | Core data model + migrations |
| 2 | Basic backoffice CRUD (login, node management with fixed types) |
| 3 | Content type builder (ACF-style) + granular role permissions |
| 4 | Public frontend: route resolution by `path`, rendering by `content_type`, archives |
| 5 | Media: upload and management via R2 |
| 6 | Dynamic theming + multi-language |
| 7 | MCP server + API tokens |
| 8 | Advanced SEO (sitemap, JSON-LD, hreflang), analytics, polish — first pilot client |
| 9 (future) | SaaS multi-tenant: control plane spinning up one Turso DB per new client |

---

## Things to watch

- **Cloudflare Workers, not Pages**: `@astrojs/cloudflare` v14 builds a Worker with an `ASSETS` binding, and that name is reserved in Pages projects — `wrangler.toml` must not carry `pages_build_output_dir`.
- **Astro 7**: stable and in use since 27 Aug 2026 (7.2.8). Tailwind is wired through `postcss.config.mjs`, not `@astrojs/tailwind`, whose peer range stopped at Astro 5.
- **`@astrojs/db` deprecated**: do not use it under any circumstance.
- **No automatic image optimization in MVP**: clients uploading heavy or unoptimized images will directly impact Core Web Vitals. Mitigate with upload limits and clear UI guidance.
- **Image optimization service for paid plan**: evaluate Cloudflare Images, ImageKit or Cloudinary when designing that feature — must be Workers-compatible (no `sharp`).
- **Drizzle/Better Auth lifecycle in Workers**: one instance per request, never shared between requests.
- **Turso pricing at scale**: revisit as the number of sites grows, ahead of the SaaS migration.
- **Renaming custom field keys**: if a client renames a field's `key`, existing data in JSON becomes orphaned. Recommended: only allow renaming the `label`; the internal `key` is immutable once created.

---

## Multi-tenant

Optional, and off unless `CONTROL_DATABASE_URL` is set. Without it the app serves a single
site exactly as it always has; with it, the request's domain decides which tenant it belongs
to, and a domain nobody has registered still falls back to the default site — so it can be
switched on for one domain at a time.

**The control plane** is a second database (`drizzle/control/`) holding tenants, their domains,
and who may administer them. It is separate on purpose: once each tenant has its own database,
the thing that resolves a domain has to run *before* knowing which database to open, so it
cannot live inside any of them.

```bash
npm run db:control:migrate                          # once, on the control database
npm run control -- add-tenant panaderia "Panadería Sol"
npm run provision -- new panaderia                  # its database: create, migrate, seed
npm run control -- map panaderia panaderia-sol.es --primary
npm run control -- status panaderia active          # until now its domains answer 503
```

`--local` on `provision new` does the whole thing against a SQLite file, so the path can be
exercised without a Turso account.

**A tenant only serves while `active`.** `provisioning` covers the window between creating it
and finishing its migrations; `suspended` cuts it off without deleting anything. Both answer
503 rather than 404 — the domain is right and the site is coming back, and a 404 tells Google
to drop it.

**`npm run provision -- migrate-all` belongs in the deploy.** With one database, migrating is a
deploy step you cannot forget. With thirty, forgetting one means a single client's site starts
failing on a column that does not exist while the other twenty-nine are fine, and nothing in
the deploy said so. `npm run provision -- status` reports who is behind — and distinguishes a
tenant that is behind from one that is unreachable, which otherwise look identical.

**Where the boundary is enforced.** Tenants sharing a database are separated by `site_id` on
every query, which `src/lib/tenant-boundary.test.ts` checks against the source on every run and
`scripts/check-tenant-boundary.sh` checks over real HTTP with two sites and two administrators.
Tenants with their own database are separated physically: a session cookie from one does not
authenticate against another.
