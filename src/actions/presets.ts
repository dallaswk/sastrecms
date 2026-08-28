import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, and } from "drizzle-orm";
import { nodes, contentTypes, settings, sites } from "@db/schema";
import { generateId, computePath } from "@lib/id";
import { requireAdmin } from "@lib/permissions";
import { getPreset, listPresets } from "@lib/presets/registry";
import { buildMenus, buildSections, orderedPages } from "@lib/presets/apply";

export const presetActions = {
  list: defineAction({
    handler: async (_input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      await requireAdmin(context.locals.db, context.locals.user.id, context.locals.siteId);

      return listPresets().map((p) => ({
        key: p.key,
        label: p.label,
        description: p.description,
        pages: p.pages.length,
        contentTypes: (p.contentTypes ?? []).length,
      }));
    },
  }),

  /**
   * Lays down a whole starting site: content types, pages with their blocks, navigation
   * and a palette.
   *
   * Refuses on a site that already has content unless explicitly told otherwise. Applying
   * a preset over a real site would bury the client's pages under demo copy, and that is
   * not something to discover afterwards.
   */
  apply: defineAction({
    input: z.object({
      key: z.string(),
      /** Required once the site has content beyond what the seed creates. */
      force: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      await requireAdmin(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      const preset = getPreset(input.key);
      if (!preset) throw new Error(`No existe el preset "${input.key}"`);

      const existing = await db.query.nodes.findMany({
        where: eq(nodes.siteId, siteId),
        columns: { id: true, slug: true, path: true, title: true },
      });

      const presetSlugs = new Set(preset.pages.map((p) => p.slug));
      const foreign = existing.filter((n) => !presetSlugs.has(n.slug));
      if (foreign.length > 0 && !input.force) {
        const names = foreign.slice(0, 4).map((n) => n.path).join(", ");
        throw new Error(
          `Este sitio ya tiene contenido propio (${names}${foreign.length > 4 ? "…" : ""}). ` +
            "Aplicar un preset encima lo dejaría enterrado bajo contenido de ejemplo. " +
            "Confirma si aun así quieres continuar."
        );
      }

      const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
      const defaultLocale = site?.defaultLocale ?? "es";

      // ---- content types the preset adds on top of the seed's
      const typesByKey = new Map(
        (await db.query.contentTypes.findMany({ where: eq(contentTypes.siteId, siteId) })).map(
          (ct) => [ct.key, ct.id]
        )
      );

      for (const ct of preset.contentTypes ?? []) {
        if (typesByKey.has(ct.key)) continue;
        const id = generateId("ct");
        await db.insert(contentTypes).values({
          id,
          siteId,
          key: ct.key,
          label: ct.label,
          icon: ct.icon,
          hasArchive: ct.hasArchive ?? false,
          supportsChildren: ct.supportsChildren ?? false,
          translatable: true,
          isSystem: false,
          fieldSchema: ct.fieldSchema,
        });
        typesByKey.set(ct.key, id);
      }

      // The page type needs a sections field, or none of the preset's blocks would render.
      const pageTypeId = typesByKey.get("page");
      if (pageTypeId) {
        const pageType = await db.query.contentTypes.findFirst({
          where: and(eq(contentTypes.id, pageTypeId), eq(contentTypes.siteId, siteId)),
        });
        const schema = pageType?.fieldSchema ?? [];
        if (!schema.some((f) => f.type === "sections")) {
          await db
            .update(contentTypes)
            .set({ fieldSchema: [...schema, { key: "bloques", label: "Secciones", type: "sections" }] })
            .where(and(eq(contentTypes.id, pageTypeId), eq(contentTypes.siteId, siteId)));
        }
      }

      // ---- pages, parents first, in two passes so sections can reference any of them
      const idsBySlug = new Map(existing.map((n) => [n.slug, n.id]));
      const pages = orderedPages(preset);
      const created: string[] = [];

      for (const page of pages) {
        if (idsBySlug.has(page.slug)) continue;
        const id = generateId("node");
        const parentId = page.parentSlug ? idsBySlug.get(page.parentSlug) ?? null : null;
        const parentPath = parentId
          ? (await db.query.nodes.findFirst({
              where: and(eq(nodes.id, parentId), eq(nodes.siteId, siteId)),
            }))?.path ?? null
          : null;

        const contentTypeId = typesByKey.get(page.contentTypeKey ?? "page");
        if (!contentTypeId) continue;

        const now = new Date();
        await db.insert(nodes).values({
          id,
          siteId,
          contentTypeId,
          parentId,
          locale: defaultLocale,
          slug: page.slug,
          path: computePath(parentPath, page.slug, defaultLocale, defaultLocale),
          position: created.length,
          status: page.publish ? "published" : "draft",
          publishedAt: page.publish ? now : null,
          title: page.title,
          fields: {},
          seo: {},
          createdBy: context.locals.user.id,
          createdVia: "web",
          createdAt: now,
          updatedAt: now,
        });
        idsBySlug.set(page.slug, id);
        created.push(page.slug);
      }

      // Second pass: every id exists now, so a block on the home page can point at a
      // listing page declared after it.
      for (const page of pages) {
        const id = idsBySlug.get(page.slug);
        if (!id) continue;
        const sections = buildSections(page.sections, idsBySlug, () => generateId("sec"));
        await db
          .update(nodes)
          .set({ fields: { ...(page.fields ?? {}), bloques: sections }, updatedAt: new Date() })
          .where(and(eq(nodes.id, id), eq(nodes.siteId, siteId)));
      }

      // ---- navigation, theme and tagline
      await db
        .update(settings)
        .set({
          menus: buildMenus(preset.menus, idsBySlug),
          theme: preset.theme,
          ...(preset.tagline ? { tagline: preset.tagline } : {}),
        })
        .where(eq(settings.siteId, siteId));

      return {
        preset: preset.key,
        createdPages: created.length,
        reusedPages: pages.length - created.length,
      };
    },
  }),
};
