import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, and } from "drizzle-orm";
import { roles, roleContentPermissions, contentTypes, userRoles } from "@db/schema";
import { generateId } from "@lib/id";
import { requireAdmin as assertAdmin } from "@lib/permissions";
import type { Database } from "@db/client";

const SITE_ID = "site_default";

/**
 * Only admins may read or rewrite the permission matrix. Checking for a session
 * alone let any role edit the rules that constrain it.
 */
async function requireAdmin(context: {
  locals: { user: { id: string } | null; db: Database };
}) {
  if (!context.locals.user) throw new Error("Unauthorized");
  await assertAdmin(context.locals.db, context.locals.user.id, SITE_ID);
}

export const permissionActions = {
  listRolesWithPermissions: defineAction({
    handler: async (_input, context) => {
      await requireAdmin(context);
      const db = context.locals.db;

      const allRoles = await db.query.roles.findMany({
        where: eq(roles.siteId, SITE_ID),
        with: { permissions: { with: { contentType: true } } },
      });

      const allContentTypes = await db.query.contentTypes.findMany({
        where: eq(contentTypes.siteId, SITE_ID),
      });

      return { roles: allRoles, contentTypes: allContentTypes };
    },
  }),

  setPermission: defineAction({
    input: z.object({
      roleId: z.string(),
      contentTypeId: z.string().nullable(),
      canView: z.boolean().default(false),
      canCreate: z.boolean().default(false),
      canEdit: z.boolean().default(false),
      canDelete: z.boolean().default(false),
      canPublish: z.boolean().default(false),
    }),
    handler: async (input, context) => {
      await requireAdmin(context);
      const db = context.locals.db;

      const existing = await db.query.roleContentPermissions.findFirst({
        where: and(
          eq(roleContentPermissions.roleId, input.roleId),
          input.contentTypeId
            ? eq(roleContentPermissions.contentTypeId, input.contentTypeId)
            : eq(roleContentPermissions.contentTypeId, null as unknown as string)
        ),
      });

      const data = {
        roleId: input.roleId,
        contentTypeId: input.contentTypeId,
        canView: input.canView,
        canCreate: input.canCreate,
        canEdit: input.canEdit,
        canDelete: input.canDelete,
        canPublish: input.canPublish,
      };

      if (existing) {
        await db
          .update(roleContentPermissions)
          .set(data)
          .where(eq(roleContentPermissions.id, existing.id));
      } else {
        await db.insert(roleContentPermissions).values({ id: generateId("perm"), ...data });
      }

      return { ok: true };
    },
  }),

  deletePermission: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      await requireAdmin(context);
      const db = context.locals.db;
      await db.delete(roleContentPermissions).where(eq(roleContentPermissions.id, input.id));
      return { ok: true };
    },
  }),
};
