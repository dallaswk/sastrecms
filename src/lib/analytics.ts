/**
 * The accepted shape of every analytics id.
 *
 * These values end up interpolated into inline <script> tags in BaseLayout, so an
 * unvalidated one is arbitrary JavaScript on every public page. The rule lives here,
 * in one place, because it is enforced twice: settings.update rejects a bad value on
 * the way in, and the layout drops it on the way out in case something was stored
 * before that validation existed. Two copies of these patterns would drift.
 */
export type AnalyticsIds = {
  ga4?: string;
  gtm?: string;
  metaPixel?: string;
  tiktokPixel?: string;
  hotjar?: string;
  gscVerification?: string;
};

export const ANALYTICS_ID_SHAPES: Record<keyof AnalyticsIds, RegExp> = {
  ga4: /^G-[A-Z0-9]{4,20}$/i,
  gtm: /^GTM-[A-Z0-9]{4,20}$/i,
  metaPixel: /^[0-9]{5,25}$/,
  tiktokPixel: /^[A-Z0-9]{5,30}$/i,
  hotjar: /^[0-9]{4,15}$/,
  gscVerification: /^[A-Za-z0-9_-]{10,100}$/,
};

/** True for a value safe to interpolate into a script tag as this kind of id. */
export function isValidAnalyticsId(key: keyof AnalyticsIds, value: unknown): boolean {
  return typeof value === "string" && ANALYTICS_ID_SHAPES[key].test(value);
}

/**
 * Drops every entry that doesn't match its shape, plus any key we don't know about.
 * Used at render time — the schema is the first line of defence, this is the second.
 */
export function sanitizeAnalyticsIds(raw: unknown): AnalyticsIds {
  if (!raw || typeof raw !== "object") return {};

  const out: AnalyticsIds = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in ANALYTICS_ID_SHAPES)) continue;
    const typed = key as keyof AnalyticsIds;
    if (isValidAnalyticsId(typed, value)) out[typed] = value as string;
  }
  return out;
}
