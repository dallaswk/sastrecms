/**
 * The document's meta tags, as data.
 *
 * Built here rather than spelled out in the layout for two reasons: the rules are worth
 * testing (an absolute OG image, a robots value that is not just "noindex or nothing", a
 * self-referencing hreflang) and the layout is already the longest file in the project.
 *
 * Plain TypeScript, no Astro imports, so vitest loads it with no scaffolding.
 */

export type MetaTag = { name?: string; property?: string; content: string };

export type OgType = "website" | "article";

export type SeoInput = {
  title: string;
  description?: string;
  /** The URL being rendered. Absolute. */
  url: string;
  /** Overrides the canonical, for a page that is a duplicate of another. */
  canonical?: string;
  siteName: string;
  /** Stored as whatever the editor typed: may be relative, may be absent. */
  image?: string;
  imageAlt?: string;
  locale?: string;
  type?: OgType;
  noindex?: boolean;
  /** Articles only. ISO strings. */
  publishedAt?: string;
  updatedAt?: string;
  author?: string;
  /** `@handle` for the Twitter card, if the site has one. */
  twitterSite?: string;
};

/**
 * Absolute, because a relative OG image is simply not fetched by any crawler — and it is the
 * single most common reason a shared link shows no preview.
 */
export function absoluteUrl(value: string | undefined, base: string): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    return new URL(value.trim(), base).toString();
  } catch {
    return undefined;
  }
}

/**
 * The robots directive.
 *
 * Positive rather than absent: with no tag, whether Google shows a large image or a text
 * snippet is its own decision. `max-image-preview:large` is what turns a shared result into
 * a card, and it costs nothing.
 */
export function robotsValue(noindex?: boolean): string {
  if (noindex) return "noindex, nofollow";
  return "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
}

/**
 * Turns a locale into the BCP 47 form OG expects (`es_ES`, not `es`).
 *
 * A bare language is what the CMS stores, and og:locale with a bare language is ignored.
 */
export function ogLocale(locale: string | undefined): string {
  const value = (locale ?? "es").replace("-", "_");
  if (value.includes("_")) return value;
  const REGION: Record<string, string> = {
    es: "es_ES", en: "en_US", ca: "ca_ES", gl: "gl_ES", eu: "eu_ES",
    fr: "fr_FR", pt: "pt_PT", de: "de_DE", it: "it_IT",
  };
  return REGION[value] ?? value;
}

/** Truncated where the search result cuts it anyway, so the editor sees what will show. */
export function clampDescription(value: string | undefined, max = 320): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function buildMeta(input: SeoInput): MetaTag[] {
  const tags: MetaTag[] = [];
  const description = clampDescription(input.description);
  const image = absoluteUrl(input.image, input.url);
  const type = input.type ?? "website";

  tags.push({ name: "robots", content: robotsValue(input.noindex) });
  if (description) tags.push({ name: "description", content: description });

  // ---- Open Graph
  tags.push({ property: "og:type", content: type });
  tags.push({ property: "og:title", content: input.title });
  tags.push({ property: "og:url", content: input.canonical?.trim() || input.url });
  tags.push({ property: "og:site_name", content: input.siteName });
  tags.push({ property: "og:locale", content: ogLocale(input.locale) });
  if (description) tags.push({ property: "og:description", content: description });

  if (image) {
    tags.push({ property: "og:image", content: image });
    // Secure URL is what older crawlers over HTTPS look for.
    if (image.startsWith("https://")) {
      tags.push({ property: "og:image:secure_url", content: image });
    }
    tags.push({ property: "og:image:alt", content: input.imageAlt || input.title });
  }

  if (type === "article") {
    if (input.publishedAt) tags.push({ property: "article:published_time", content: input.publishedAt });
    if (input.updatedAt) tags.push({ property: "article:modified_time", content: input.updatedAt });
    if (input.author) tags.push({ property: "article:author", content: input.author });
  }

  // ---- Twitter. A card without an image is a summary; with one it is large.
  tags.push({ name: "twitter:card", content: image ? "summary_large_image" : "summary" });
  tags.push({ name: "twitter:title", content: input.title });
  if (description) tags.push({ name: "twitter:description", content: description });
  if (image) {
    tags.push({ name: "twitter:image", content: image });
    tags.push({ name: "twitter:image:alt", content: input.imageAlt || input.title });
  }
  if (input.twitterSite) {
    const handle = input.twitterSite.trim().replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//, "");
    const at = handle.startsWith("@") ? handle : `@${handle.replace(/\/$/, "")}`;
    if (at.length > 1) tags.push({ name: "twitter:site", content: at });
  }

  return tags;
}

export type HreflangLink = { hreflang: string; href: string };

/**
 * The hreflang set, including the self-reference and `x-default`.
 *
 * Google ignores a set that does not include the page pointing at itself — the single most
 * common way a correct-looking hreflang block does nothing. `x-default` names the page for a
 * visitor whose language matches none of them.
 */
export function buildHreflang(
  links: { locale: string; path: string }[],
  base: string,
  defaultLocale?: string
): HreflangLink[] {
  if (links.length < 2) return [];

  const out: HreflangLink[] = [];
  for (const link of links) {
    const href = absoluteUrl(link.path, base);
    if (href) out.push({ hreflang: link.locale, href });
  }
  if (!out.length) return [];

  const fallback = links.find((l) => l.locale === defaultLocale) ?? links[0];
  const href = absoluteUrl(fallback.path, base);
  if (href) out.push({ hreflang: "x-default", href });

  return out;
}
