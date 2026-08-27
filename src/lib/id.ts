export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Builds the public path for a node.
 *
 * The unique index is (siteId, path), so two translations that share a slug would
 * collide. The default locale keeps the bare path and every other locale is namespaced
 * under its code — the same convention WordPress and Astro's own i18n routing use, and
 * the one search engines read without ambiguity.
 *
 *   es (default)  contacto  ->  /contacto
 *   en            contact   ->  /en/contact
 *   en            contacto  ->  /en/contacto   (no longer collides with the Spanish one)
 *
 * Nested nodes inherit whatever prefix their parent already carries, so the locale is
 * only ever applied once, at the root of each tree.
 */
export function computePath(
  parentPath: string | null,
  slug: string,
  locale?: string,
  defaultLocale?: string
): string {
  if (parentPath && parentPath !== "/") return `${parentPath}/${slug}`;

  const prefix =
    locale && defaultLocale && locale !== defaultLocale ? `/${locale}` : "";

  // "index" is the home slug: it names the root of its locale, not a child of it.
  // The wizard already writes "/" for the default-locale home; this keeps every other
  // caller (and recomputePaths) agreeing with it instead of producing "/index".
  if (slug === "index") return prefix || "/";

  return `${prefix}/${slug}`;
}
