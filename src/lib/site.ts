import { eq } from "drizzle-orm";
import { sites } from "@db/schema";
import type { Database } from "@db/client";

/**
 * The site a mono-tenant deployment falls back to.
 *
 * Referenced by bootstrap code — the seed, the wizard, the middleware — and by `resolveSiteId`
 * when no site claims the request's host. Request handling reads `locals.siteId`.
 */
export const DEFAULT_SITE_ID = "site_default";

/**
 * Resolved hosts, for the life of the isolate.
 *
 * This runs on *every* public request, so an uncached lookup would put a Turso round trip in
 * front of every page on every site. The map is per-isolate, which is the same scope the
 * bootstrap flag uses: a warm isolate is fast, a fresh one pays once, and a changed mapping
 * takes effect as isolates recycle.
 *
 * That last part is the trade, and it is worth stating: pointing a domain at a different site
 * is not instant. Making it instant needs an explicit invalidation, which is a control-plane
 * concern rather than something to guess at now.
 */
const hostCache = new Map<string, string>();

/** The host, without the port. `cliente.com:443` and `cliente.com` are the same site. */
export function normaliseHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

/**
 * Which site a request belongs to.
 *
 * Looks the host up against `sites.host`. A host nobody claims falls back to the default site,
 * which is what keeps a single-site deployment working on any domain without configuration —
 * and what makes this change safe to ship before there is a second site.
 */
export async function resolveSiteId(db: Database, host: string): Promise<string> {
  const key = normaliseHost(host);
  if (!key) return DEFAULT_SITE_ID;

  const cached = hostCache.get(key);
  if (cached) return cached;

  const row = await db.query.sites.findFirst({
    where: eq(sites.host, key),
    columns: { id: true },
  });

  const siteId = row?.id ?? DEFAULT_SITE_ID;
  hostCache.set(key, siteId);
  return siteId;
}

/** Drops a host from the cache, for when a mapping changes within a live isolate. */
export function forgetHost(host: string): void {
  hostCache.delete(normaliseHost(host));
}
