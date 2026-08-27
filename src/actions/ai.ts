import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { eq } from "drizzle-orm";
import { settings } from "@db/schema";
import { requireAdmin } from "@lib/permissions";
import { chatCompletion, testConnection, missingAiFields, type AiConfig } from "@lib/ai";
import type { Database } from "@db/client";

/** Reads the stored configuration. Never returned to the client: it holds the key. */
async function loadConfig(db: Database, siteId: string): Promise<AiConfig> {
  const row = await db.query.settings.findFirst({
    where: eq(settings.siteId, siteId),
    columns: { integrations: true },
  });
  const integrations = (row?.integrations ?? {}) as Record<string, string>;
  return {
    baseUrl: integrations.aiBaseUrl,
    apiKey: integrations.aiApiKey,
    model: integrations.aiModel,
  };
}

export const aiActions = {
  /**
   * Verifies the credentials with a real completion.
   *
   * Admin only, and it uses the *stored* configuration rather than accepting one in the
   * request: an endpoint that will call any URL with any key on request is an open proxy, and
   * a rather useful one for probing an internal network from this Worker.
   */
  test: defineAction({
    handler: async (_input, context) => {
      if (!context.locals.user) throw new ActionError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const siteId = context.locals.siteId;
      await requireAdmin(context.locals.db, context.locals.user.id, siteId);

      const config = await loadConfig(context.locals.db, siteId);
      const missing = missingAiFields(config);
      if (missing.length > 0) {
        return { ok: false, reason: `Falta ${missing.join(" y ")}. Guarda los ajustes primero.` };
      }

      const result = await testConnection(config);
      return result.ok
        ? { ok: true, model: result.model ?? config.model, reply: result.text.trim().slice(0, 60) }
        : { ok: false, reason: result.reason };
    },
  }),

  /**
   * A raw completion, for the generators that come next.
   *
   * The prompt comes from the caller but the credentials never do. Capped and given a hard
   * timeout because an editor waiting on a hung provider has no way to tell it apart from a
   * broken page.
   */
  complete: defineAction({
    input: z.object({
      system: z.string().max(4000).optional(),
      prompt: z.string().min(1).max(8000),
      maxTokens: z.number().int().min(16).max(4096).optional(),
      temperature: z.number().min(0).max(2).optional(),
      json: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new ActionError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const siteId = context.locals.siteId;
      // Any role, not admin: generating a draft is content work. The key stays server-side
      // either way — it is never sent to the browser.
      const { requireSiteRole } = await import("@lib/permissions");
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);

      const config = await loadConfig(context.locals.db, siteId);
      const result = await chatCompletion(
        config,
        [
          ...(input.system ? [{ role: "system" as const, content: input.system }] : []),
          { role: "user" as const, content: input.prompt },
        ],
        {
          ...(input.maxTokens ? { maxTokens: input.maxTokens } : {}),
          ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
          ...(input.json ? { json: true } : {}),
          timeoutMs: 45_000,
        }
      );

      return result.ok
        ? { ok: true as const, text: result.text, ...(result.usage ? { usage: result.usage } : {}) }
        : { ok: false as const, reason: result.reason };
    },
  }),
};
