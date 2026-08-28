import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, and, isNull } from "drizzle-orm";
import { apiTokens } from "@db/schema";
import { generateId } from "@lib/id";
import { generateRawToken, hashToken } from "@lib/api-token";

export const tokenActions = {
  list: defineAction({
    handler: async (_input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      // Scoped to this site as well as this user: without it, the panel of one site listed —
      // and could revoke — the tokens its owner had created for another.
      return context.locals.db.query.apiTokens.findMany({
        where: and(
          eq(apiTokens.userId, context.locals.user.id),
          eq(apiTokens.siteId, context.locals.siteId),
          isNull(apiTokens.revokedAt)
        ),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
    },
  }),

  create: defineAction({
    input: z.object({ label: z.string().min(1) }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const db = context.locals.db;

      const rawToken = generateRawToken();
      const tokenHash = await hashToken(rawToken);
      const id = generateId("token");

      await db.insert(apiTokens).values({
        id,
        // Bound to the site it was created from. The MCP endpoint resolves the site from the
        // host and refuses a token that belongs to a different one.
        siteId: context.locals.siteId,
        userId: context.locals.user.id,
        tokenHash,
        label: input.label,
        createdAt: new Date(),
      });

      return { id, rawToken };
    },
  }),

  revoke: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const db = context.locals.db;

      const token = await db.query.apiTokens.findFirst({
        where: and(
          eq(apiTokens.id, input.id),
          eq(apiTokens.userId, context.locals.user.id),
          eq(apiTokens.siteId, context.locals.siteId)
        ),
      });
      if (!token) throw new Error("Token not found");

      await db
        .update(apiTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiTokens.id, input.id), eq(apiTokens.siteId, context.locals.siteId)));

      return { id: input.id };
    },
  }),
};
