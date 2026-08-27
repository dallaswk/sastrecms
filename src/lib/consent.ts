import type { AnalyticsIds } from "./analytics";

/**
 * Cookie consent, as data.
 *
 * Everything here is shared by three consumers: the banner's markup, the client script that
 * actually injects the trackers, and the generated cookie policy — whose table is derived
 * from the trackers the site has configured, because a hand-maintained cookie table is the
 * one nobody ever updates.
 *
 * No imports beyond the analytics types, so the client bundle stays tiny: this would be the
 * first public JavaScript in the project and the budget is a few kilobytes, not a framework.
 */

export const CONSENT_CATEGORIES = ["necesarias", "analitica", "marketing"] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

/** What the visitor decided. `necesarias` is not a choice, so it is not stored. */
export type ConsentState = Partial<Record<Exclude<ConsentCategory, "necesarias">, boolean>>;

export const CATEGORY_LABELS: Record<ConsentCategory, string> = {
  necesarias: "Necesarias",
  analitica: "Analítica",
  marketing: "Marketing",
};

export const CATEGORY_DESCRIPTIONS: Record<ConsentCategory, string> = {
  necesarias:
    "Imprescindibles para que la web funcione: sesión, idioma y seguridad del formulario. No se pueden desactivar y no requieren tu consentimiento.",
  analitica:
    "Nos dicen qué páginas se visitan y desde dónde, de forma agregada, para saber qué mejorar.",
  marketing:
    "Permiten medir la eficacia de la publicidad y mostrarte anuncios relacionados en otras webs.",
};

/** One tracker: which category it needs, and what it drops on the visitor's device. */
export type TrackerSpec = {
  key: keyof AnalyticsIds;
  name: string;
  category: Exclude<ConsentCategory, "necesarias">;
  provider: string;
  /** Where the provider processes the data, which the privacy policy has to state. */
  transfer: string;
  privacyUrl: string;
  cookies: { name: string; purpose: string; retention: string }[];
};

/**
 * The trackers this CMS knows how to load.
 *
 * `gscVerification` is deliberately absent: it is a meta tag, sets no cookie and needs no
 * consent — treating it as a tracker would mean the site could not prove ownership to Google
 * until a visitor accepted cookies.
 */
export const TRACKERS: TrackerSpec[] = [
  {
    key: "ga4",
    name: "Google Analytics 4",
    category: "analitica",
    provider: "Google Ireland Limited",
    transfer: "EE. UU. (Cláusulas Contractuales Tipo)",
    privacyUrl: "https://policies.google.com/privacy",
    cookies: [
      { name: "_ga", purpose: "Distinguir visitantes de forma anónima", retention: "2 años" },
      { name: "_ga_*", purpose: "Mantener el estado de la sesión", retention: "2 años" },
    ],
  },
  {
    key: "gtm",
    name: "Google Tag Manager",
    category: "analitica",
    provider: "Google Ireland Limited",
    transfer: "EE. UU. (Cláusulas Contractuales Tipo)",
    privacyUrl: "https://policies.google.com/privacy",
    // GTM itself sets nothing; it loads what is configured inside it, which is exactly why
    // it needs consent before it runs at all.
    cookies: [
      { name: "—", purpose: "No fija cookies por sí mismo: carga las etiquetas configuradas en él", retention: "—" },
    ],
  },
  {
    key: "metaPixel",
    name: "Meta Pixel",
    category: "marketing",
    provider: "Meta Platforms Ireland Limited",
    transfer: "EE. UU. (Cláusulas Contractuales Tipo)",
    privacyUrl: "https://www.facebook.com/privacy/policy",
    cookies: [
      { name: "_fbp", purpose: "Identificar navegadores para publicidad", retention: "3 meses" },
      { name: "fr", purpose: "Entrega de publicidad y medición", retention: "3 meses" },
    ],
  },
  {
    key: "tiktokPixel",
    name: "TikTok Pixel",
    category: "marketing",
    provider: "TikTok Information Technologies UK Limited",
    transfer: "Fuera del EEE (Cláusulas Contractuales Tipo)",
    privacyUrl: "https://www.tiktok.com/legal/privacy-policy",
    cookies: [
      { name: "_ttp", purpose: "Medición y atribución de publicidad", retention: "13 meses" },
    ],
  },
  {
    key: "hotjar",
    name: "Hotjar",
    category: "analitica",
    provider: "Hotjar Limited (Malta)",
    transfer: "EEE",
    privacyUrl: "https://www.hotjar.com/legal/policies/privacy/",
    cookies: [
      { name: "_hjSession*", purpose: "Datos de la sesión de navegación", retention: "30 minutos" },
      { name: "_hjSessionUser*", purpose: "Identificador de usuario para muestreo", retention: "1 año" },
    ],
  },
];

/** The trackers this site has actually configured. */
export function activeTrackers(ids: AnalyticsIds): TrackerSpec[] {
  return TRACKERS.filter((tracker) => {
    const value = ids[tracker.key];
    return typeof value === "string" && value.trim() !== "";
  });
}

/**
 * The categories the banner should offer.
 *
 * A site with no marketing pixel must not ask for marketing consent: an unnecessary toggle
 * is a reason to refuse the whole banner, and consent for a purpose that does not exist is
 * not valid consent anyway.
 */
export function neededCategories(ids: AnalyticsIds): Exclude<ConsentCategory, "necesarias">[] {
  const needed = new Set(activeTrackers(ids).map((t) => t.category));
  return (["analitica", "marketing"] as const).filter((c) => needed.has(c));
}

/** Whether a banner is needed at all. */
export function needsBanner(ids: AnalyticsIds): boolean {
  return neededCategories(ids).length > 0;
}

/**
 * The cookie table for the policy, derived from what is configured.
 *
 * The strictly necessary rows are always present, because they are always true: the session
 * cookie and the consent record itself exist whatever the site loads.
 */
export type CookieRow = {
  name: string;
  provider: string;
  purpose: string;
  retention: string;
  category: ConsentCategory;
};

export const NECESSARY_COOKIES: CookieRow[] = [
  {
    name: "better-auth.session_token",
    provider: "Este sitio",
    purpose: "Mantener la sesión de las personas que administran la web",
    retention: "7 días",
    category: "necesarias",
  },
  {
    name: "sastre_consent",
    provider: "Este sitio",
    purpose: "Recordar tu decisión sobre las cookies para no volver a preguntártela",
    retention: "6 meses",
    category: "necesarias",
  },
  {
    name: "cf_clearance / __cf_bm",
    provider: "Cloudflare",
    purpose: "Distinguir personas de bots y proteger el formulario de contacto",
    retention: "30 minutos – 1 año",
    category: "necesarias",
  },
];

export function cookieTable(ids: AnalyticsIds): CookieRow[] {
  const rows = [...NECESSARY_COOKIES];
  for (const tracker of activeTrackers(ids)) {
    for (const cookie of tracker.cookies) {
      rows.push({
        name: cookie.name,
        provider: tracker.name,
        purpose: cookie.purpose,
        retention: cookie.retention,
        category: tracker.category,
      });
    }
  }
  return rows;
}

/** Whatever is in storage, read as a decision. An unreadable value means "not asked yet". */
export function parseConsent(raw: unknown): ConsentState | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    const state: ConsentState = {};
    for (const category of ["analitica", "marketing"] as const) {
      if (typeof parsed[category] === "boolean") state[category] = parsed[category] as boolean;
    }
    return Object.keys(state).length ? state : null;
  } catch {
    return null;
  }
}

/**
 * Whether the stored decision still covers what the site now loads.
 *
 * If the owner adds a marketing pixel after a visitor accepted analytics only, that visitor
 * has consented to nothing about marketing — so they have to be asked again rather than the
 * new pixel loading on an old "accept".
 */
export function consentCovers(state: ConsentState | null, ids: AnalyticsIds): boolean {
  if (!state) return false;
  return neededCategories(ids).every((category) => category in state);
}

/** Google Consent Mode v2 signals for a decision. */
export function consentModeSignals(state: ConsentState): Record<string, "granted" | "denied"> {
  const analytics = state.analitica ? "granted" : "denied";
  const marketing = state.marketing ? "granted" : "denied";
  return {
    ad_storage: marketing,
    ad_user_data: marketing,
    ad_personalization: marketing,
    analytics_storage: analytics,
  };
}
