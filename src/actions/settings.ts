import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq } from "drizzle-orm";
import { settings } from "@db/schema";
import { requireAdmin } from "@lib/permissions";
import { ANALYTICS_ID_SHAPES } from "@lib/analytics";

const SITE_ID = "site_default";

/**
 * The shapes live in @lib/analytics because the layout enforces the same rule at render
 * time. The empty string stays allowed so a field can be cleared from the UI.
 */
function analyticsId(pattern: RegExp) {
  return z
    .string()
    .regex(pattern, "Formato de identificador no válido")
    .or(z.literal(""))
    .optional();
}

const AnalyticsSchema = z.object(
  Object.fromEntries(
    Object.entries(ANALYTICS_ID_SHAPES).map(([key, pattern]) => [key, analyticsId(pattern)])
  ) as Record<keyof typeof ANALYTICS_ID_SHAPES, ReturnType<typeof analyticsId>>
);

const ThemeSchema = z.object({
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  baseColor: z.string().optional(),
  borderRadius: z.string().optional(),
  fontHeading: z.string().optional(),
  fontBody: z.string().optional(),
  daisyuiTheme: z.string().optional(),
});

const SocialLinksSchema = z.object({
  twitter: z.string().url().optional().or(z.literal("")),
  instagram: z.string().url().optional().or(z.literal("")),
  linkedin: z.string().url().optional().or(z.literal("")),
  facebook: z.string().url().optional().or(z.literal("")),
  youtube: z.string().url().optional().or(z.literal("")),
  github: z.string().url().optional().or(z.literal("")),
});

export const settingsActions = {
  get: defineAction({
    handler: async (_input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      // `integrations` carries the Resend API key in clear, and redirects/analytics
      // affect every public page — admin only, not merely authenticated.
      await requireAdmin(context.locals.db, context.locals.user.id, SITE_ID);
      const row = await context.locals.db.query.settings.findFirst({
        where: eq(settings.siteId, SITE_ID),
      });
      return row ?? null;
    },
  }),

  update: defineAction({
    input: z.object({
      siteName: z.string().min(1).optional(),
      tagline: z.string().optional(),
      logoUrl: z.string().optional(),
      faviconUrl: z.string().optional(),
      theme: ThemeSchema.optional(),
      socialLinks: SocialLinksSchema.optional(),
      analyticsIds: AnalyticsSchema.optional(),
      redirects: z
        .array(z.object({ from: z.string(), to: z.string(), permanent: z.boolean() }))
        .optional(),
      integrations: z.object({
        resendApiKey: z.string().optional(),
        resendFrom: z.string().optional(),
      }).optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      await requireAdmin(context.locals.db, context.locals.user.id, SITE_ID);
      const db = context.locals.db;

      const existing = await db.query.settings.findFirst({
        where: eq(settings.siteId, SITE_ID),
      });

      const updates: Record<string, unknown> = {};
      if (input.siteName !== undefined) updates.siteName = input.siteName;
      if (input.tagline !== undefined) updates.tagline = input.tagline;
      if (input.logoUrl !== undefined) updates.logoUrl = input.logoUrl;
      if (input.faviconUrl !== undefined) updates.faviconUrl = input.faviconUrl;
      if (input.theme !== undefined) updates.theme = input.theme;
      if (input.socialLinks !== undefined) updates.socialLinks = input.socialLinks;
      if (input.analyticsIds !== undefined) updates.analyticsIds = input.analyticsIds;
      if (input.redirects !== undefined) updates.redirects = input.redirects;
      if (input.integrations !== undefined) updates.integrations = input.integrations;

      if (existing) {
        await db.update(settings).set(updates).where(eq(settings.siteId, SITE_ID));
      } else {
        await db.insert(settings).values({ siteId: SITE_ID, siteName: "My Site", ...updates });
      }

      return { ok: true };
    },
  }),
};
