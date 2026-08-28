import { and, eq, inArray } from "drizzle-orm";
import { media } from "@db/schema";
import { mediaIdsIn } from "./media-url";
import type { Database } from "@db/client";

/** What a page needs about an image it only knows the URL of. */
export type MediaInfo = { url: string; altText: string | null; width: number | null; height: number | null };

/**
 * Looks up every image a page is about to render, in one query.
 *
 * Called once per page from the renderer rather than once per image from each component: a
 * page with a twelve-image gallery would otherwise make twelve round trips to Turso, which
 * on Workers is twelve times the network latency before the first byte.
 */
export async function lookupMedia(
  db: Database | null | undefined,
  /**
   * El sitio que se está pintando. Obligatorio y por delante de los datos a propósito: los
   * ids no vienen de una consulta acotada, sino de leer las URL que hay escritas en los
   * campos del nodo. Basta con que alguien pegue en un campo la URL de un archivo de otro
   * cliente para que esto devuelva su fila — poco, un texto alternativo y unas dimensiones,
   * pero de otro inquilino.
   */
  siteId: string,
  urls: unknown[]
): Promise<Map<string, MediaInfo>> {
  const out = new Map<string, MediaInfo>();
  if (!db) return out;

  const ids = mediaIdsIn(urls);
  if (!ids.length) return out;

  const rows = await db.query.media.findMany({
    where: and(eq(media.siteId, siteId), inArray(media.id, ids)),
    columns: { url: true, altText: true, width: true, height: true },
  });

  // Keyed by URL, because that is what the caller holds. An external URL simply is not in
  // the map, and the component falls back to a plain <img>.
  for (const row of rows) out.set(row.url, row);
  return out;
}

/**
 * The props an `<img>` or `<SmartImage>` needs for one URL.
 *
 * Every section rendered `alt=""` — on every image, on every site. For a decorative
 * background that is correct; for a team photo, a portfolio cover or a gallery it is an
 * unlabelled image for a screen reader and a missing signal for a crawler. The alt text has
 * been in the media table all along and was never read.
 *
 * `decorative` is the deliberate exception: an image whose only job is to sit behind text
 * must keep an empty alt, or a screen reader announces the decoration.
 */
export function imgProps(
  map: Map<string, MediaInfo> | undefined,
  url: string,
  options?: { decorative?: boolean; fallbackAlt?: string }
): { src: string; alt: string; width: number | null; height: number | null } {
  const info = map?.get(url);
  return {
    src: url,
    alt: options?.decorative ? "" : info?.altText || options?.fallbackAlt || "",
    width: info?.width ?? null,
    height: info?.height ?? null,
  };
}
