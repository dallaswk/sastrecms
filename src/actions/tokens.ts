import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, and, isNull } from "drizzle-orm";
import { apiTokens } from "@db/schema";
import { generateId } from "@/lib/id";
import { generateRawToken, hashToken } from "@/lib/api-token";

export const tokenActions = {
  list: defineAction({
    handler: async (_input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      return context.locals.db.query.apiTokens.findMany({
        where: and(
          eq(apiTokens.userId, context.locals.user.id),
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
          eq(apiTokens.userId, context.locals.user.id)
        ),
      });
      if (!token) throw new Error("Token not found");

      await db
        .update(apiTokens)
        .set({ revokedAt: new Date() })
        .where(eq(apiTokens.id, input.id));

      return { id: input.id };
    },
  }),
};
