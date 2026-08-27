import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq } from "drizzle-orm";
import { settings } from "@db/schema";
import { requireAdmin } from "@lib/permissions";
import { ANALYTICS_ID_SHAPES } from "@lib/analytics";
import { normalizeMenus } from "@lib/menus";
import { SITE_THEMES, FONTS, CONTAINER_WIDTHS, TYPE_SCALES } from "@lib/theme";
import { MenusSchema } from "./menus";
import { invalidateSettings } from "@lib/cache-invalidate";

/**
 * The shapes live in @lib/analytics because the layout enforces the same rule at render
 * time. The empty string stays allowed so a field can be cleared from the UI.
 */
// z.enum needs a non-empty tuple, so the registries are widened here rather than inline.
const FONT_KEYS = FONTS.map((f) => f.key) as [string, ...string[]];
const CONTAINER_KEYS = CONTAINER_WIDTHS.map((c) => c.key) as [string, ...string[]];
const TYPE_SCALE_KEYS = TYPE_SCALES.map((t) => t.key) as [string, ...string[]];

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

/**
 * Every choice is checked against the registry, not accepted as free text.
 *
 * A theme name that Tailwind never compiled, or a font key that maps to nothing, produces a
 * site that silently renders with the defaults and no indication why. And `daisyuiTheme`
 * lands in a `data-theme` attribute, so it is also the one field here that reaches the DOM.
 */
const ThemeSchema = z.object({
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  baseColor: z.string().optional(),
  borderRadius: z.string().optional(),
  fontHeading: z.enum(FONT_KEYS).or(z.literal("")).optional(),
  fontBody: z.enum(FONT_KEYS).or(z.literal("")).optional(),
  daisyuiTheme: z.enum(SITE_THEMES).or(z.literal("")).optional(),
  containerWidth: z.enum(CONTAINER_KEYS).or(z.literal("")).optional(),
  typeScale: z.enum(TYPE_SCALE_KEYS).or(z.literal("")).optional(),
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
      const siteId = context.locals.siteId;
      // `integrations` carries the Resend API key in clear, and redirects/analytics
      // affect every public page — admin only, not merely authenticated.
      await requireAdmin(context.locals.db, context.locals.user.id, siteId);
      const row = await context.locals.db.query.settings.findFirst({
        where: eq(settings.siteId, siteId),
      });
      return row ?? null;
    },
  }),

  update: defineAction({
    input: z.object({
      siteName: z.string().min(1).optional(),
      tagline: z.string().optional(),
      contactEmail: z.string().email().or(z.literal("")).optional(),
      logoUrl: z.string().optional(),
      faviconUrl: z.string().optional(),
      theme: ThemeSchema.optional(),
      socialLinks: SocialLinksSchema.optional(),
      analyticsIds: AnalyticsSchema.optional(),
      // Kept alongside the dedicated menus action so one call can write a whole site.
      menus: MenusSchema.optional(),
      redirects: z
        .array(z.object({ from: z.string(), to: z.string(), permanent: z.boolean() }))
        .optional(),
      // Free text: these are names, addresses and registry entries, and a shape check would
      // reject a perfectly valid foreign address. They are escaped at render time.
      business: z.record(z.string(), z.string()).optional(),
      integrations: z.object({
        resendApiKey: z.string().optional(),
        resendFrom: z.string().optional(),
        turnstileSiteKey: z.string().optional(),
        turnstileSecretKey: z.string().optional(),
        // OpenAI-compatible, so the base URL is a setting rather than a constant. Free text:
        // it may be a self-hosted vLLM on any host, and the key format differs per provider.
        aiBaseUrl: z.string().optional(),
        aiApiKey: z.string().optional(),
        aiModel: z.string().optional(),
      }).optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      await requireAdmin(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      const existing = await db.query.settings.findFirst({
        where: eq(settings.siteId, siteId),
      });

      const updates: Record<string, unknown> = {};
      if (input.siteName !== undefined) updates.siteName = input.siteName;
      if (input.tagline !== undefined) updates.tagline = input.tagline;
      if (input.contactEmail !== undefined) updates.contactEmail = input.contactEmail;
      if (input.logoUrl !== undefined) updates.logoUrl = input.logoUrl;
      if (input.faviconUrl !== undefined) updates.faviconUrl = input.faviconUrl;
      if (input.theme !== undefined) updates.theme = input.theme;
      if (input.socialLinks !== undefined) updates.socialLinks = input.socialLinks;
      if (input.analyticsIds !== undefined) updates.analyticsIds = input.analyticsIds;
      if (input.menus !== undefined) updates.menus = normalizeMenus(input.menus);
      if (input.redirects !== undefined) updates.redirects = input.redirects;
      if (input.business !== undefined) updates.business = input.business;
      if (input.integrations !== undefined) updates.integrations = input.integrations;

      if (existing) {
        await db.update(settings).set(updates).where(eq(settings.siteId, siteId));
      } else {
        await db.insert(settings).values({ siteId, siteName: "My Site", ...updates });
      }

      await invalidateSettings(context.cache, siteId);

      return { ok: true };
    },
  }),
};
