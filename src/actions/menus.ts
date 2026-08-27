import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, and } from "drizzle-orm";
import { settings, nodes } from "@db/schema";
import { requireSiteRole } from "@lib/permissions";
import { normalizeMenus } from "@lib/menus";

const MenuItemSchema = z.object({
  label: z.string().min(1),
  nodeId: z.string().optional(),
  url: z.string().optional(),
});

/**
 * Shared with `settings.update`, which still accepts menus so a whole site's configuration
 * can be written in one call.
 *
 * A partial object, not z.record() with an enum key: in zod 4 an enum key makes every key
 * required, so a site with no footer menu could not save at all.
 */
export const MenusSchema = z.object({
  main: z.array(MenuItemSchema).optional(),
  footer: z.array(MenuItemSchema).optional(),
  legal: z.array(MenuItemSchema).optional(),
});

/**
 * Navigation lives in `settings.menus`, but editing it does not belong behind the same
 * door as the Resend key and the analytics ids. A menu is site furniture, not a secret,
 * and whoever writes the content is who notices a link is missing — so this needs a role
 * on the site rather than the admin role.
 */
export const menuActions = {
  get: defineAction({
    handler: async (_input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      const row = await db.query.settings.findFirst({
        where: eq(settings.siteId, siteId),
        columns: { menus: true },
      });

      // Only published pages: an entry pointing at a draft is a link to a 404 on every
      // page of the site.
      const linkables = await db.query.nodes.findMany({
        where: and(eq(nodes.siteId, siteId), eq(nodes.status, "published")),
        columns: { id: true, title: true, path: true },
        orderBy: (n, { asc }) => [asc(n.path)],
      });

      return { menus: row?.menus ?? {}, linkables };
    },
  }),

  update: defineAction({
    input: z.object({ menus: MenusSchema }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      await db
        .update(settings)
        .set({ menus: normalizeMenus(input.menus) })
        .where(eq(settings.siteId, siteId));
      return { ok: true };
    },
  }),
};
