import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { and, eq, isNull } from "drizzle-orm";
import { media, nodes, settings } from "@db/schema";
import { requireSiteRole, requirePermission } from "@lib/permissions";
import { chatCompletion, missingAiFields, type AiConfig } from "@lib/ai";
import { visibleNodes } from "@lib/node-queries";
import { invalidateNode } from "@lib/cache-invalidate";
import { findUrlInValue, urlMatchCandidates } from "@lib/media-usage";
import { sectionsFieldOf } from "@lib/renderers";
import { hasVisibleContent } from "@lib/page-content";
import { sanitizeFields } from "@lib/sanitize";
import { generateId } from "@lib/id";
import {
  contentPrompt,
  extractJsonArray,
  checkBlocks,
  summariseBlocks,
  issuesAsInstruction,
  MIN_BLOCKS,
} from "@lib/ai-content";
import {
  AI_TASKS,
  ALT_LIMITS,
  DESCRIPTION_LIMITS,
  altPrompt,
  checkProposal,
  descriptionPrompt,
  extractPageText,
  needsHint,
  type AiTaskId,
  type SiteContext,
} from "@lib/ai-tasks";

/**
 * The AI-assisted fixes, as three separate steps.
 *
 * `items` gathers what needs doing, `propose` asks the model about one of them, and `accept`
 * saves a value a person has seen. They are separate on purpose: a single «fix it» action would
 * write text nobody read, and that was the one thing ruled out.
 *
 * `accept` takes the value from the request rather than re-generating, so what gets saved is
 * exactly what was on screen — including any edit made to it.
 */

type Ctx = Parameters<Parameters<typeof defineAction>[0]["handler"]>[1];

async function loadAi(context: Ctx): Promise<AiConfig> {
  const row = await context.locals.db.query.settings.findFirst({
    where: eq(settings.siteId, context.locals.siteId),
    columns: { integrations: true },
  });
  const integrations = (row?.integrations ?? {}) as Record<string, string>;
  return {
    baseUrl: integrations.aiBaseUrl,
    apiKey: integrations.aiApiKey,
    model: integrations.aiModel,
  };
}

async function loadSiteContext(context: Ctx): Promise<SiteContext> {
  const siteId = context.locals.siteId;
  const row = await context.locals.db.query.settings.findFirst({
    where: eq(settings.siteId, siteId),
    columns: { siteName: true, tagline: true, business: true },
  });
  const business = (row?.business ?? {}) as Record<string, string>;

  const pages = await context.locals.db.query.nodes.findMany({
    where: visibleNodes(siteId, new Date()),
    columns: { title: true, path: true },
    orderBy: (n, { asc }) => [asc(n.path)],
    limit: 20,
  });

  return {
    siteName: row?.siteName ?? "",
    ...(row?.tagline ? { tagline: row.tagline } : {}),
    ...(business.legalName || business.tradeName
      ? { activity: business.tradeName || business.legalName }
      : {}),
    otherPages: pages.map((page) => ({ title: page.title, path: page.path })),
  };
}

/**
 * Which pages use an image.
 *
 * The alt text of a hero background and of a team photo are different sentences, so the model
 * gets told where the file appears. `urlMatchCandidates` because R2_PUBLIC_URL can have changed
 * between deployments, leaving older rows pointing at a different origin for the same object.
 */
function pagesUsing(
  pages: { title: string; path: string; fields: unknown; seo: unknown }[],
  url: string,
  storageKey: string
): string[] {
  const candidates = urlMatchCandidates(url, storageKey);
  const used: string[] = [];

  for (const page of pages) {
    const hit = candidates.some(
      (candidate) =>
        findUrlInValue(page.fields, candidate).length > 0 ||
        findUrlInValue(page.seo, candidate).length > 0
    );
    if (hit) used.push(`${page.title} (${page.path})`);
  }

  return used;
}

export const aiFixActions = {
  /**
   * Proposes the blocks of a whole page.
   *
   * A hint is required, not optional: at this volume a model with only a title invents a sector
   * and produces four confident paragraphs about a different business. One retry is attempted
   * automatically when the first answer has fixable problems, with those problems fed back — a
   * second identical request would just get a second identical answer.
   */
  proposeContent: defineAction({
    input: z.object({
      nodeId: z.string(),
      hint: z.string().min(10).max(2000),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new ActionError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const siteId = context.locals.siteId;
      const db = context.locals.db;
      await requireSiteRole(db, context.locals.user.id, siteId);

      const config = await loadAi(context);
      const missing = missingAiFields(config);
      if (missing.length) {
        return { ok: false as const, reason: `Falta ${missing.join(" y ")} en Ajustes → Inteligencia artificial.` };
      }

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.nodeId), eq(nodes.siteId, siteId), isNull(nodes.deletedAt)),
        with: { contentType: true },
      });
      if (!node) return { ok: false as const, reason: "Esa página ya no existe." };

      const sectionsField = sectionsFieldOf(node.contentType ?? null);
      if (!sectionsField) {
        return {
          ok: false as const,
          reason: `El tipo «${node.contentType?.key}» no se compone de bloques, así que no hay nada que generar.`,
        };
      }

      const site = await loadSiteContext(context);
      const built = contentPrompt(site, {
        title: node.title,
        path: node.path,
        hint: input.hint,
      });

      let attempt = 0;
      let issues: ReturnType<typeof checkBlocks>["issues"] = [];
      let blocks: ReturnType<typeof checkBlocks>["blocks"] = [];
      let lastReason = "";

      // Two attempts at most. A third would be a third bill for the same request.
      while (attempt < 2) {
        const retry = attempt > 0 ? `\n\n${issuesAsInstruction(issues)}` : "";
        const result = await chatCompletion(
          config,
          [
            { role: "system", content: built.system },
            { role: "user", content: built.prompt + retry },
          ],
          { maxTokens: 2500, temperature: 0.7, timeoutMs: 60_000 }
        );

        if (!result.ok) return { ok: false as const, reason: result.reason };

        const extracted = extractJsonArray(result.text);
        if (!extracted.ok) {
          lastReason = extracted.reason;
          issues = [{ index: 0, message: extracted.reason }];
          attempt++;
          continue;
        }

        const checked = checkBlocks(extracted.value, () => generateId("sec"));
        blocks = checked.blocks;
        issues = checked.issues;

        // Enough usable blocks to be a page. One valid block out of six is not worth showing.
        if (blocks.length >= MIN_BLOCKS) break;
        lastReason = `Sólo ${blocks.length} bloque(s) válidos.`;
        attempt++;
      }

      if (blocks.length === 0) {
        return {
          ok: false as const,
          reason: lastReason || "El modelo no ha devuelto bloques utilizables.",
          issues,
        };
      }

      return {
        ok: true as const,
        blocks,
        summary: summariseBlocks(blocks),
        issues,
        attempts: attempt + 1,
      };
    },
  }),

  /**
   * Saves blocks a person has seen.
   *
   * Re-validated here rather than trusted: the browser could have been sitting on the proposal
   * while somebody edited the section registry, and the value arrives over the wire either way.
   * Appended, never replacing — a page that turned out not to be empty keeps what it had.
   */
  acceptContent: defineAction({
    input: z.object({
      nodeId: z.string(),
      blocks: z.array(z.record(z.string(), z.unknown())).min(1).max(12),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new ActionError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.nodeId), eq(nodes.siteId, siteId), isNull(nodes.deletedAt)),
        with: { contentType: true },
      });
      if (!node) throw new ActionError({ code: "BAD_REQUEST", message: "Esa página ya no existe." });
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "edit");

      const sectionsField = sectionsFieldOf(node.contentType ?? null);
      if (!sectionsField) {
        throw new ActionError({ code: "BAD_REQUEST", message: "Ese tipo no se compone de bloques." });
      }

      const checked = checkBlocks(input.blocks, () => generateId("sec"));
      if (checked.blocks.length === 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `Ninguno de los bloques es válido. ${checked.issues.map((i) => i.message).join(" ")}`,
        });
      }

      const fields = { ...((node.fields ?? {}) as Record<string, unknown>) };
      const existing = Array.isArray(fields[sectionsField.key])
        ? (fields[sectionsField.key] as unknown[])
        : [];
      fields[sectionsField.key] = [...existing, ...checked.blocks];

      /*
       * Saved as a draft when the page was published.
       *
       * An empty published page is already visible; replacing it with four paragraphs nobody has
       * read on the live site is worse than leaving it empty. Unpublishing makes the next step —
       * look at it, then publish — explicit.
       */
      const wasPublished = node.status === "published";

      await db
        .update(nodes)
        .set({
          fields: sanitizeFields(fields),
          ...(wasPublished ? { status: "draft" as const } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(nodes.id, node.id), eq(nodes.siteId, siteId)));

      await invalidateNode(context.cache, {
        siteId,
        nodeId: node.id,
        contentTypeId: node.contentTypeId,
        parentId: node.parentId,
      });

      return {
        ok: true,
        added: checked.blocks.length,
        path: node.path,
        unpublished: wasPublished,
      };
    },
  }),

  /**
   * What this task has to work through.
   *
   * Returns the context too, so the panel can show what the model will be told — a proposal you
   * cannot explain is a proposal you cannot judge.
   */
  items: defineAction({
    input: z.object({ task: z.enum(AI_TASKS) }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new ActionError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const siteId = context.locals.siteId;
      const db = context.locals.db;
      await requireSiteRole(db, context.locals.user.id, siteId);

      const config = await loadAi(context);
      const missing = missingAiFields(config);
      const site = await loadSiteContext(context);

      if (input.task === "descriptions") {
        const published = await db.query.nodes.findMany({
          where: visibleNodes(siteId, new Date()),
          columns: { id: true, title: true, path: true, fields: true, seo: true },
          orderBy: (n, { asc }) => [asc(n.path)],
        });

        // The ones already written are context for the ones that are not.
        const written = published
          .map((node) => ((node.seo as Record<string, unknown>)?.metaDescription as string) ?? "")
          .filter((value) => value.trim());

        const items = published
          .filter((node) => !((node.seo as Record<string, unknown>)?.metaDescription as string)?.trim())
          .map((node) => ({
            id: node.id,
            path: node.path,
            title: node.title,
            content: extractPageText(node.fields).slice(0, 1500),
            siblings: written,
          }));

        return { task: input.task, site, items, missing, limits: DESCRIPTION_LIMITS };
      }

      if (input.task === "alt") {
        const images = await db.query.media.findMany({
          where: and(eq(media.siteId, siteId), eq(media.type, "image")),
          columns: { id: true, url: true, altText: true, storageKey: true },
        });

        // Where each image is used, so a team photo and a hero background get different alts.
        const allNodes = await db.query.nodes.findMany({
          where: and(eq(nodes.siteId, siteId), isNull(nodes.deletedAt)),
          columns: { id: true, title: true, path: true, fields: true, seo: true },
        });

        const items = images
          .filter((image) => !image.altText?.trim())
          .map((image) => ({
            id: image.id,
            // The filename is often the only clue there is.
            filename: image.storageKey.split("/").pop() ?? image.url.split("/").pop() ?? "",
            url: image.url,
            usedOn: pagesUsing(allNodes, image.url, image.storageKey),
          }));

        return { task: input.task, site, items, missing, limits: ALT_LIMITS };
      }

      /*
       * Empty pages, by the shared rule.
       *
       * `extractPageText` alone counted the three legal pages as empty — their `legal` block
       * generates its whole text at render time — and offered them up for the AI to write
       * invented legal text over. `hasVisibleContent` is the same rule the dashboard uses.
       */
      const published = await db.query.nodes.findMany({
        where: visibleNodes(siteId, new Date()),
        columns: { id: true, title: true, path: true, fields: true },
        with: { contentType: true },
      });
      const empty = published.filter((node) => !hasVisibleContent(node.fields, node.contentType));

      /*
       * Only pages that can actually hold blocks.
       *
       * Without this the panel listed three empty pages and every attempt on them failed with
       * «el tipo post no se compone de bloques» — a list of buttons that cannot work. A `post`
       * with no body needs its richtext written in the editor, which is a different job.
       */
      const items = empty
        .filter((node) => !!sectionsFieldOf(node.contentType ?? null))
        .map((node) => ({ id: node.id, path: node.path, title: node.title, content: "", siblings: [] }));

      const notComposable = empty
        .filter((node) => !sectionsFieldOf(node.contentType ?? null))
        .map((node) => ({ path: node.path, title: node.title, type: node.contentType?.key ?? "?" }));

      return { task: input.task, site, items, missing, limits: DESCRIPTION_LIMITS, notComposable };
    },
  }),

  /**
   * One proposal. Writes nothing.
   *
   * The item's context is rebuilt server-side from its id rather than taken from the request:
   * the prompt should describe the page as it is, not as a stale browser tab remembers it.
   */
  propose: defineAction({
    input: z.object({
      task: z.enum(AI_TASKS),
      itemId: z.string(),
      /** A nudge from the person, e.g. «más corta» or «menciona el precio cerrado». */
      instruction: z.string().max(500).optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new ActionError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const siteId = context.locals.siteId;
      const db = context.locals.db;
      await requireSiteRole(db, context.locals.user.id, siteId);

      const config = await loadAi(context);
      const missing = missingAiFields(config);
      if (missing.length) {
        return { ok: false as const, reason: `Falta ${missing.join(" y ")} en Ajustes → Inteligencia artificial.` };
      }

      const site = await loadSiteContext(context);
      let built: { system: string; prompt: string };
      let limits: { min: number; ideal: number; max: number } = DESCRIPTION_LIMITS;

      if (input.task === "alt") {
        const image = await db.query.media.findFirst({
          where: and(eq(media.id, input.itemId), eq(media.siteId, siteId)),
        });
        if (!image) return { ok: false as const, reason: "Esa imagen ya no existe." };

        const allNodes = await db.query.nodes.findMany({
          where: and(eq(nodes.siteId, siteId), isNull(nodes.deletedAt)),
          columns: { id: true, title: true, path: true, fields: true, seo: true },
        });

        limits = ALT_LIMITS;
        built = altPrompt(site, {
          id: image.id,
          filename: image.storageKey.split("/").pop() ?? "",
          url: image.url,
          usedOn: pagesUsing(allNodes, image.url, image.storageKey),
        });
      } else {
        const node = await db.query.nodes.findFirst({
          where: and(eq(nodes.id, input.itemId), eq(nodes.siteId, siteId), isNull(nodes.deletedAt)),
          columns: { id: true, title: true, path: true, fields: true, seo: true },
        });
        if (!node) return { ok: false as const, reason: "Esa página ya no existe." };

        const others = await db.query.nodes.findMany({
          where: visibleNodes(siteId, new Date()),
          columns: { id: true, seo: true },
        });
        const siblings = others
          .filter((other) => other.id !== node.id)
          .map((other) => ((other.seo as Record<string, unknown>)?.metaDescription as string) ?? "")
          .filter((value) => value.trim());

        const content = extractPageText(node.fields).slice(0, 1500);

        /*
         * A page with nothing to read needs a human hint before the model is asked.
         *
         * Without one it invents the sector: on this project it read «sASTRe» / «Astro» as
         * astronomy and wrote about astrophysics for a CMS blog. Refusing here is better than
         * proposing something confident and wrong, which is the version somebody accepts by
         * mistake.
         */
        if (needsHint({ content }) && !input.instruction?.trim()) {
          return {
            ok: false as const,
            reason:
              "Esta página no tiene texto, así que la IA sólo tiene el título y el lema — y con " +
              "eso se inventa el sector. Dile en una línea de qué va y vuelve a probar.",
            needsHint: true as const,
          };
        }

        built = descriptionPrompt(site, {
          id: node.id,
          path: node.path,
          title: node.title,
          content,
          siblings,
          // The hint goes *into* the prompt, replacing the do-not-invent warning, rather than
          // being appended after it — with both present the model refused even when told.
          ...(content.trim() ? {} : { hint: input.instruction?.trim() ?? "" }),
        });
      }

      /*
       * The instruction is appended only when it was not already folded into the prompt.
       *
       * For a page with no text it *is* the context, and repeating it as an afterthought made the
       * model treat it as secondary to the do-not-invent warning and refuse.
       */
      const foldedIn = input.task === "descriptions" && built.prompt.includes("dice de qué va");
      const prompt =
        input.instruction?.trim() && !foldedIn
          ? `${built.prompt}\n\nInstrucción adicional de la persona: ${input.instruction.trim()}`
          : built.prompt;

      const result = await chatCompletion(
        config,
        [
          { role: "system", content: built.system },
          { role: "user", content: prompt },
        ],
        // Room for the model to overshoot, since checkProposal will catch it and the alternative
        // is a sentence cut off mid-word.
        { maxTokens: 300, temperature: 0.8, timeoutMs: 30_000 }
      );

      if (!result.ok) return { ok: false as const, reason: result.reason };

      const check = checkProposal(result.text, limits);
      return {
        ok: true as const,
        ...check,
        limits,
        ...(result.usage ? { usage: result.usage } : {}),
      };
    },
  }),

  /**
   * Saves a value the person has seen and accepted.
   *
   * Goes through the same path as a manual edit, so an AI-written description gets a revision
   * and can be reverted like anything else — which is the point of never trusting it blindly.
   */
  accept: defineAction({
    input: z.object({
      task: z.enum(AI_TASKS),
      itemId: z.string(),
      value: z.string().min(1).max(500),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new ActionError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const value = input.value.trim();
      if (!value) throw new ActionError({ code: "BAD_REQUEST", message: "Está vacío." });

      if (input.task === "alt") {
        await requireSiteRole(db, context.locals.user.id, siteId);
        const image = await db.query.media.findFirst({
          where: and(eq(media.id, input.itemId), eq(media.siteId, siteId)),
        });
        if (!image) throw new ActionError({ code: "BAD_REQUEST", message: "Esa imagen ya no existe." });

        const check = checkProposal(value, ALT_LIMITS);
        if (check.errors.length) {
          throw new ActionError({ code: "BAD_REQUEST", message: check.errors.join(" ") });
        }

        await db
          .update(media)
          .set({ altText: check.value })
          .where(and(eq(media.id, image.id), eq(media.siteId, siteId)));
        // The alt is read at render time from the media row, so every page using it changes.
        await invalidateNode(context.cache, { siteId, nodeId: image.id });
        return { ok: true, saved: check.value };
      }

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.itemId), eq(nodes.siteId, siteId), isNull(nodes.deletedAt)),
      });
      if (!node) throw new ActionError({ code: "BAD_REQUEST", message: "Esa página ya no existe." });
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "edit");

      const check = checkProposal(value, DESCRIPTION_LIMITS);
      if (check.errors.length) {
        throw new ActionError({ code: "BAD_REQUEST", message: check.errors.join(" ") });
      }

      const seo = { ...((node.seo ?? {}) as Record<string, unknown>), metaDescription: check.value };
      await db
        .update(nodes)
        .set({ seo, updatedAt: new Date() })
        .where(and(eq(nodes.id, node.id), eq(nodes.siteId, siteId)));

      await invalidateNode(context.cache, {
        siteId,
        nodeId: node.id,
        contentTypeId: node.contentTypeId,
        parentId: node.parentId,
      });

      return { ok: true, saved: check.value, path: node.path };
    },
  }),
};
