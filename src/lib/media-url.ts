/**
 * Recovering a media record from the URL a field stores.
 *
 * Content fields store the *URL*, not the media id — that decision is already made and
 * migrating it would touch every stored field on every site. But the alt text, the width and
 * the height live on the media row, and rendering an image without them is what produces a
 * layout shift and an unlabelled image.
 *
 * The upload builds the key deterministically as `${siteId}/${id}.${ext}`, so the id can be
 * read back out of the URL — one query per page for every image on it, instead of a join
 * that does not exist.
 */

/** Media ids are `media_` plus the generator's suffix. */
const ID_IN_PATH = /(?:^|\/)(media_[A-Za-z0-9]+)\.[A-Za-z0-9]+$/;

export function mediaIdFromUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;

  // Take the path whether the value is absolute, protocol-relative or a bare path: a field
  // written by hand, by an import or by an agent can be any of the three.
  let path = url.trim();
  try {
    path = new URL(path, "https://placeholder.invalid").pathname;
  } catch {
    // Not URL-shaped; fall through and match against the raw string.
  }

  // Query strings and fragments are stripped by the URL parse above, but a raw string that
  // failed to parse may still carry them.
  path = path.split("?")[0].split("#")[0];

  return ID_IN_PATH.exec(path)?.[1] ?? null;
}

/** Every media id referenced by a page's values, deduplicated, for a single lookup. */
export function mediaIdsIn(values: unknown[]): string[] {
  const ids = new Set<string>();
  for (const value of values) {
    const id = mediaIdFromUrl(value);
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * The intrinsic ratio, for `aspect-ratio` in CSS.
 *
 * Returns null rather than a guess when a dimension is missing: reserving the wrong space is
 * a worse layout shift than reserving none.
 */
export function aspectRatio(
  width: number | null | undefined,
  height: number | null | undefined
): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  return `${width} / ${height}`;
}

/**
 * Every string in a value that looks like a media URL.
 *
 * Walks the whole structure because a section's data can nest arbitrarily — a repeater of
 * cards each with an image, a gallery's array of URLs — and the page needs all of them
 * collected before it can look them up in one query.
 *
 * Depth-limited: section data is JSON from the database, and an agent or a bad import can
 * produce something deeper than it should be. Recursing without a bound turns that into a
 * stack overflow on a public page.
 */
export function collectMediaUrls(value: unknown, depth = 0): string[] {
  if (depth > 12) return [];

  if (typeof value === "string") {
    return mediaIdFromUrl(value) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectMediaUrls(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      collectMediaUrls(item, depth + 1)
    );
  }
  return [];
}
