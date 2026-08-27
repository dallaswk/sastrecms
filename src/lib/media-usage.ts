/**
 * Where a media URL is referenced.
 *
 * Deleting a file removes the R2 object and the row with no undo and no check, so a
 * published post can lose its cover image while still serving a 200 — the page just has
 * a broken image and nobody finds out. Content fields store the *URL*, not the media id,
 * so the only way to answer "is this in use?" is to look inside the JSON.
 */

/** A single place a URL was found, described for a human to go and check. */
export type UsageLocation = {
  /** The field key, with an index for galleries: `cover_image`, `gallery[2]`. */
  field: string;
  /** `exact` when the field holds the URL; `embedded` when it appears inside text. */
  kind: "exact" | "embedded";
};

/**
 * Walks a parsed JSON value looking for the URL.
 *
 * Two kinds of hit, and the distinction matters to whoever reads the warning: an `exact`
 * hit is an image or gallery field pointing at the file, and deleting it leaves a visibly
 * broken image. An `embedded` hit is the URL inside rich text — usually an `<img src>`
 * that got in through the MCP surface, since the Tiptap toolbar cannot insert images.
 */
export function findUrlInValue(
  value: unknown,
  url: string,
  path = "",
  out: UsageLocation[] = []
): UsageLocation[] {
  if (typeof value === "string") {
    if (value === url) out.push({ field: path || "(raíz)", kind: "exact" });
    else if (value.includes(url)) out.push({ field: path || "(raíz)", kind: "embedded" });
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((item, i) => findUrlInValue(item, url, `${path}[${i}]`, out));
    return out;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      findUrlInValue(item, url, path ? `${path}.${key}` : key, out);
    }
  }

  return out;
}

/**
 * The URL as it may have been stored.
 *
 * `R2_PUBLIC_URL` can change between deployments — it did during this project's own
 * setup, when the public host was hardcoded wrong — so older rows can hold a different
 * origin for the same object. Matching the storage key as well catches those.
 */
export function urlMatchCandidates(url: string, storageKey: string): string[] {
  const candidates = new Set<string>([url]);
  if (storageKey) candidates.add(storageKey);
  return [...candidates].filter(Boolean);
}

/**
 * Human summary for the confirmation prompt.
 *
 * Counts site settings separately: a file can be the site logo without any content
 * linking it, and saying "not linked anywhere" above a list containing the logo is
 * exactly the kind of contradiction that makes people click through a warning.
 */
export function describeUsage(
  count: number,
  publishedCount: number,
  settingsCount = 0
): string {
  const inSettings =
    settingsCount === 1
      ? "Se usa en los ajustes del sitio"
      : `Se usa en ${settingsCount} sitios de los ajustes`;

  if (count === 0) {
    return settingsCount === 0
      ? "No está enlazado en ningún contenido."
      : `${inSettings}. Ningún contenido lo enlaza.`;
  }

  const what = count === 1 ? "1 contenido lo enlaza" : `${count} contenidos lo enlazan`;
  const published =
    publishedCount === 0
      ? `${what}, ninguno publicado.`
      : publishedCount === count
        ? count === 1
          ? `${what} y está publicado.`
          : `${what} y todos están publicados.`
        : `${what}, ${publishedCount} de ellos publicados.`;

  return settingsCount === 0 ? published : `${published} ${inSettings}.`;
}
