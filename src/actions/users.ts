import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, and } from "drizzle-orm";
import { users, roles, userRoles, sessions } from "@db/schema";
import { requireAdmin as assertAdmin } from "@lib/permissions";
import type { Database } from "@db/client";

const SITE_ID = "site_default";

/**
 * Authentication is not authorisation. This used to check `locals.user` only, which
 * let any collaborator with a session call assignRole and promote themselves.
 */
async function requireAdmin(context: {
  locals: { user: { id: string } | null; db: Database };
}) {
  if (!context.locals.user) throw new Error("Unauthorized");
  await assertAdmin(context.locals.db, context.locals.user.id, SITE_ID);
}

export const userActions = {
  list: defineAction({
    handler: async (_input, context) => {
      await requireAdmin(context);
      const db = context.locals.db;

      const allUsers = await db.query.users.findMany({
        orderBy: (u, { asc }) => [asc(u.name)],
      });

      const assignments = await db.query.userRoles.findMany({
        where: eq(userRoles.siteId, SITE_ID),
        with: { role: true },
      });

      const roleByUser = Object.fromEntries(
        assignments.map((a) => [a.userId, a.role])
      );

      return allUsers.map((u) => ({ ...u, role: roleByUser[u.id] ?? null }));
    },
  }),

  assignRole: defineAction({
    input: z.object({
      userId: z.string(),
      roleKey: z.enum(["admin", "editor", "collaborator"]),
    }),
    handler: async (input, context) => {
      await requireAdmin(context);
      const db = context.locals.db;

      const role = await db.query.roles.findFirst({
        where: and(eq(roles.siteId, SITE_ID), eq(roles.key, input.roleKey)),
      });
      if (!role) throw new Error(`Role "${input.roleKey}" not found`);

      const existing = await db.query.userRoles.findFirst({
        where: and(
          eq(userRoles.userId, input.userId),
          eq(userRoles.siteId, SITE_ID)
        ),
      });

      if (existing) {
        await db
          .update(userRoles)
          .set({ roleId: role.id })
          .where(
            and(
              eq(userRoles.userId, input.userId),
              eq(userRoles.siteId, SITE_ID)
            )
          );
      } else {
        await db.insert(userRoles).values({
          userId: input.userId,
          roleId: role.id,
          siteId: SITE_ID,
          assignedAt: new Date(),
        });
      }

      return { ok: true };
    },
  }),

  removeRole: defineAction({
    input: z.object({ userId: z.string() }),
    handler: async (input, context) => {
      await requireAdmin(context);
      const db = context.locals.db;

      await db
        .delete(userRoles)
        .where(
          and(
            eq(userRoles.userId, input.userId),
            eq(userRoles.siteId, SITE_ID)
          )
        );

      return { ok: true };
    },
  }),

  deactivate: defineAction({
    input: z.object({ userId: z.string() }),
    handler: async (input, context) => {
      await requireAdmin(context);
      if (input.userId === context.locals.user!.id) {
        throw new Error("No puedes desactivarte a ti mismo");
      }
      const db = context.locals.db;

      // Flip the flag the middleware enforces and drop every live session, so the
      // user is out immediately instead of on their next login attempt.
      await db.update(users).set({ disabled: true }).where(eq(users.id, input.userId));
      await db.delete(sessions).where(eq(sessions.userId, input.userId));

      return { ok: true };
    },
  }),

  reactivate: defineAction({
    input: z.object({ userId: z.string() }),
    handler: async (input, context) => {
      await requireAdmin(context);
      await context.locals.db
        .update(users)
        .set({ disabled: false })
        .where(eq(users.id, input.userId));
      return { ok: true };
    },
  }),
};
