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

/**
 * Con qué `baseURL` se monta Better Auth en esta petición.
 *
 * No puede ser una constante en cuanto la aplicación responde en más de un dominio: Better Auth
 * valida la cabecera `Origin` contra el `baseURL`, así que con `BETTER_AUTH_URL` fijo todos los
 * dominios menos ése contestan «Invalid origin» y nadie entra. No salió en ninguna prueba
 * automática porque `curl` no manda `Origin` y un navegador la manda siempre.
 *
 * Y tampoco puede ser el host de la petición sin más. El `baseURL` es con lo que se construyen
 * los enlaces que salen por correo, así que quien pidiera un enlace mágico con
 * `Host: sitio-falso.com` conseguiría que a la víctima le llegue un enlace con un token válido
 * apuntando a su dominio.
 *
 * Lo que resuelve las dos cosas es que el conjunto de hosts buenos ya se conoce: los que están
 * dados de alta. Un host reconocido se cree; uno que no, se cae a `BETTER_AUTH_URL`.
 */
export function authBaseUrl(input: {
  /** El origen de la petición, tal cual: `https://cliente.com`. */
  requestOrigin: string;
  /** El host de la petición. Se normaliza aquí. */
  requestHost: string;
  /** Si el plano de control ha reconocido el dominio. */
  claimedByTenant: boolean;
  /** El host registrado en `sites.host`, cuando lo hay. */
  siteHost?: string | null;
  /** El configurado en el entorno, si lo hay. */
  configured?: string | undefined;
}): string {
  const known =
    input.claimedByTenant ||
    (input.siteHost != null && normaliseHost(input.siteHost) === normaliseHost(input.requestHost));

  if (known) return input.requestOrigin;
  return input.configured ?? input.requestOrigin;
}
