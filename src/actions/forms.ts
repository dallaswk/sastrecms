import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { formSubmissions, nodes, settings } from "@db/schema";
import { generateId } from "@lib/id";
import { requireAdmin, requireSiteRole } from "@lib/permissions";
import { parseSections } from "@lib/sections/validate";
import { parseFormFields, validateSubmission, identifySender } from "@lib/forms/validate";
import { clientIp, hashIp, honeypotTripped, rateVerdict, rateWindows, verifyTurnstile } from "@lib/forms/guards";
import { sendEmail } from "@lib/email";
import { buildAutoReply, buildNotification } from "@lib/forms/notify";
import { getSection } from "@lib/sections/registry";
import type { SectionInstance } from "@lib/sections/types";
import type { Database } from "@db/client";

/** The editor stores booleans as a "no"/"sí" select. */
function truthy(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return value === "sí" || value === "si" || value === "true" || value === "1";
}

/**
 * The notification's recipients.
 *
 * Comma-separated, because a pyme's enquiries usually need to reach two people. Capped at
 * five and shape-checked so a stray value in the section cannot turn the form into a way to
 * mail an arbitrary list.
 */
function recipients(raw: string): string[] {
  return raw
    .split(",")
    .map((address) => address.trim())
    .filter((address) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(address))
    .slice(0, 5);
}

/** Spanish format, so the owner reads a date they recognise. */
function formatDate(date: Date): string {
  return date.toLocaleString("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  });
}

/** Where the form's own definition lives, found by walking the node's sections fields. */
async function findForm(db: Database, siteId: string, nodeId: string, formId: string) {
  const node = await db.query.nodes.findFirst({
    where: and(eq(nodes.id, nodeId), eq(nodes.siteId, siteId)),
    with: { contentType: true },
  });
  if (!node) return null;

  // Only a published page accepts submissions: a draft's form is not live yet, and a form
  // on an unpublished page is the classic way a test submission reaches a real inbox.
  if (node.status !== "published") return null;

  const schema = node.contentType?.fieldSchema ?? [];
  const sectionKeys = schema.filter((f: { type: string }) => f.type === "sections").map((f: { key: string }) => f.key);
  const stored = (node.fields ?? {}) as Record<string, unknown>;

  for (const key of sectionKeys) {
    const { sections } = parseSections(stored[key]);
    const found = (sections as SectionInstance[]).find((s) => s.id === formId && s.type === "contact");
    if (found && !found.hidden) return { node, section: found };
  }

  return null;
}

export const formActions = {
  /**
   * Public: no session, by design — this is a contact form on a public page.
   *
   * The protections are, in order of what they cost: the field list comes from the stored
   * section rather than from the request, a honeypot, a rate limit by hashed IP, and
   * Turnstile when it is configured.
   */
  submit: defineAction({
    input: z.object({
      nodeId: z.string(),
      formId: z.string(),
      values: z.record(z.string(), z.union([z.string(), z.boolean()])),
      turnstileToken: z.string().optional(),
      consented: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const db = context.locals.db;
      const siteId = context.locals.siteId;

      const form = await findForm(db, siteId, input.nodeId, input.formId);
      if (!form) {
        // Deliberately vague: whether a given id is a live form on this site is not
        // something a public endpoint should confirm.
        return { ok: false as const, message: "Este formulario ya no está disponible." };
      }

      const fields = parseFormFields(form.section.data.fields);
      if (fields.length === 0) {
        return { ok: false as const, message: "Este formulario no está configurado." };
      }

      // ---- honeypot: silently accepted, so a bot cannot learn it was caught
      if (honeypotTripped(input.values)) {
        return { ok: true as const };
      }

      const ip = clientIp(context.request.headers);
      const secret = context.locals.env.BETTER_AUTH_SECRET ?? "";
      const ipHash = await hashIp(ip, secret);

      // ---- rate limit
      const now = new Date();
      const windows = rateWindows(now);
      const [ipCount, siteCount] = await Promise.all([
        ipHash
          ? db
              .select({ n: count() })
              .from(formSubmissions)
              .where(and(eq(formSubmissions.ipHash, ipHash), gte(formSubmissions.createdAt, windows.ip)))
          : Promise.resolve([{ n: 0 }]),
        db
          .select({ n: count() })
          .from(formSubmissions)
          .where(and(eq(formSubmissions.siteId, siteId), gte(formSubmissions.createdAt, windows.site))),
      ]);

      const verdict = rateVerdict({
        fromIp: Number(ipCount[0]?.n ?? 0),
        fromSite: Number(siteCount[0]?.n ?? 0),
      });
      if (!verdict.allowed) {
        return { ok: false as const, message: verdict.reason };
      }

      // ---- Turnstile
      const integrations = (context.locals.settings?.integrations as Record<string, string> | null) ?? {};
      const turnstile = await verifyTurnstile(integrations.turnstileSecretKey, input.turnstileToken, ip);
      if (!turnstile.ok) {
        return { ok: false as const, message: turnstile.reason };
      }

      // ---- the fields themselves
      const result = validateSubmission(fields, input.values);
      if (!result.ok) {
        return {
          ok: false as const,
          message: "Revisa los campos marcados.",
          issues: result.issues,
        };
      }

      const consentText = (form.section.data.consent_text as string) ?? "";
      if (consentText && !input.consented) {
        return { ok: false as const, message: "Debes aceptar el tratamiento de tus datos." };
      }

      const sender = identifySender(fields, result.values);
      const id = generateId("sub");

      await db.insert(formSubmissions).values({
        id,
        siteId,
        nodeId: form.node.id,
        formId: input.formId,
        formLabel: (form.section.data.title as string) ?? getSection("contact")?.label ?? "Formulario",
        values: result.values,
        fromName: sender.name ?? null,
        fromEmail: sender.email ?? null,
        status: "new",
        ipHash,
        userAgent: context.request.headers.get("User-Agent")?.slice(0, 300) ?? null,
        consentText: consentText || null,
        createdAt: now,
      });

      // ---- notifications, after the row is safe. A mail failure is recorded, never
      // raised: the visitor's message is already stored and telling them it failed
      // would be a lie.
      const notifyList = recipients(
        (form.section.data.notify_email as string) || context.locals.settings?.contactEmail || ""
      );

      const templateBase = {
        fields,
        values: result.values,
        sender,
        siteName: context.locals.settings?.siteName ?? "el sitio",
        pageTitle: form.node.title,
        pageUrl: new URL(form.node.path, context.request.url).toString(),
        date: formatDate(now),
        ...(consentText ? { consentText } : {}),
      };

      const mailConfig = { apiKey: integrations.resendApiKey, from: integrations.resendFrom };
      const failures: string[] = [];

      if (notifyList.length) {
        const email = await sendEmail(
          mailConfig,
          buildNotification({
            ...templateBase,
            to: notifyList,
            subjectTemplate: form.section.data.notify_subject as string,
            bodyTemplate: form.section.data.notify_body as string,
          })
        );
        if (!email.sent) failures.push(email.reason);
      }

      // The acknowledgement goes only to an address the visitor typed into an `email` field
      // of this form, so it cannot be used to mail a stranger of the sender's choosing.
      const wantsAutoReply = truthy(form.section.data.autoreply);
      if (wantsAutoReply && sender.email) {
        const email = await sendEmail(
          mailConfig,
          buildAutoReply({
            ...templateBase,
            to: sender.email,
            subjectTemplate: form.section.data.autoreply_subject as string,
            bodyTemplate: form.section.data.autoreply_body as string,
            ...(notifyList[0] ? { replyToOwner: notifyList[0] } : {}),
          })
        );
        if (!email.sent) failures.push(`Acuse de recibo: ${email.reason}`);
      }

      if (notifyList.length || wantsAutoReply) {
        await db
          .update(formSubmissions)
          .set(
            failures.length
              ? { notifyError: failures.join(" · ").slice(0, 500) }
              : { notifiedAt: new Date(), notifyError: null }
          )
          .where(and(eq(formSubmissions.id, id), eq(formSubmissions.siteId, siteId)));
      }

      return { ok: true as const };
    },
  }),

  /** The inbox. Any role on the site: answering enquiries is not an admin task. */
  list: defineAction({
    input: z
      .object({
        status: z.enum(["new", "read", "spam"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .optional(),
    handler: async (input, context) => {
      if (!context.locals.user) throw new ActionError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);

      const where = input?.status
        ? and(eq(formSubmissions.siteId, siteId), eq(formSubmissions.status, input.status))
        : eq(formSubmissions.siteId, siteId);

      return context.locals.db.query.formSubmissions.findMany({
        where,
        orderBy: [desc(formSubmissions.createdAt)],
        limit: input?.limit ?? 100,
      });
    },
  }),

  setStatus: defineAction({
    input: z.object({
      ids: z.array(z.string()).min(1).max(200),
      status: z.enum(["new", "read", "spam"]),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new ActionError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);

      await context.locals.db
        .update(formSubmissions)
        .set({ status: input.status })
        // siteId in the where, not just the ids: without it an id from another site would
        // be writable once this stops being mono-tenant.
        .where(and(eq(formSubmissions.siteId, siteId), inArray(formSubmissions.id, input.ids)));

      return { ok: true, updated: input.ids.length };
    },
  }),

  /** Admin only, unlike the rest: a deleted lead is a lost client and there is no trash. */
  remove: defineAction({
    input: z.object({ ids: z.array(z.string()).min(1).max(200) }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new ActionError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      const siteId = context.locals.siteId;
      await requireAdmin(context.locals.db, context.locals.user.id, siteId);

      await context.locals.db
        .delete(formSubmissions)
        .where(and(eq(formSubmissions.siteId, siteId), inArray(formSubmissions.id, input.ids)));

      return { ok: true, deleted: input.ids.length };
    },
  }),
};
