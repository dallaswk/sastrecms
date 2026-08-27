import type { Database } from "@db/client";

/**
 * The one site a mono-tenant deployment serves. Only bootstrap code should reference
 * this constant directly — the seed, the wizard and the middleware's ensureBootstrap.
 * Everything handling a request reads `locals.siteId` instead.
 */
export const DEFAULT_SITE_ID = "site_default";

/**
 * Works out which site a request belongs to.
 *
 * Today every deployment serves exactly one site, so the answer is always the same and
 * costs no query. The host is threaded through anyway because this is the single place
 * the SaaS phase has to change: look the host up against a `sites.host` column (or the
 * control plane) and return that id. Every call site already passes the request through
 * `locals.siteId`, so none of them will need touching.
 *
 * Async on purpose, for the same reason: the lookup will need I/O and the signature
 * should not have to change when it does.
 */
export async function resolveSiteId(
  _db: Database,
  _host: string
): Promise<string> {
  return DEFAULT_SITE_ID;
}
