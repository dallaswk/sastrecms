import { defineMiddleware } from "astro:middleware";
import { SECURITY_HEADERS, HSTS_HEADER, buildCsp, CSP_HEADER_REPORT } from "@lib/headers";
import { eq } from "drizzle-orm";
import { createDb, type Database } from "@db/client";
import { createAuth } from "@lib/auth";
import { isAdmin } from "@lib/permissions";
import { resolveSiteId, authBaseUrl } from "@lib/site";
import { resolveTenant, isServable } from "@lib/tenant";
import { createControlDb } from "@db/control-client";
import { resolveMediaStore } from "@lib/media-store";
import { rolesForSite } from "@lib/roles";
import { sites, settings, roles, users } from "@db/schema";

/**
 * The runtime environment: plain vars in dev via dotenv, and on Workers the real `env`
 * from `cloudflare:workers` — which also carries the bindings, not just strings.
 *
 * Never reach for `locals.runtime.env`: in @astrojs/cloudflare v14 that getter *throws*
 * ("has been removed in Astro v6"), so optional chaining does not protect you. This is
 * the single place bindings are resolved.
 */
async function loadEnv(): Promise<RuntimeEnv> {
  try {
    const { env } = await import("cloudflare:workers");
    return (env ?? {}) as unknown as RuntimeEnv;
  } catch {
    const { default: dotenv } = await import("dotenv");
    dotenv.config();
    return process.env as unknown as RuntimeEnv;
  }
}

/**
 * Which sites this isolate has already bootstrapped.
 *
 * A boolean was right for one site and wrong the moment there are two: the first request to
 * reach a warm isolate would set the flag and every other site would never be initialised. A set
 * keeps the same property per site — a fresh isolate re-checks, a warm one does not.
 */
const bootstrapped = new Set<string>();

async function ensureBootstrap(db: Database, siteId: string) {
  const SITE_ID = siteId;
  if (bootstrapped.has(SITE_ID)) return;

  const site = await db.query.sites.findFirst({ where: eq(sites.id, SITE_ID) });
  if (!site) {
    await db.insert(sites).values({
      id: SITE_ID,
      name: "Mi sitio",
      locales: ["es"],
    }).onConflictDoNothing();
    await db.insert(settings).values({
      siteId: SITE_ID,
      siteName: "Mi sitio",
    }).onConflictDoNothing();
  }

  const existingRoles = await db.query.roles.findMany({ where: eq(roles.siteId, SITE_ID) });
  if (existingRoles.length === 0) {
    // Ids carry the site. They used to be global constants, so a second site's insert collided
    // on the primary key, onConflictDoNothing swallowed it, and that site ran with no roles at
    // all — nobody could administer it and nothing said why.
    await db.insert(roles).values(rolesForSite(SITE_ID)).onConflictDoNothing();
  }

  bootstrapped.add(SITE_ID);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const env = await loadEnv();
  const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = env;
  if (!TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL is not set");

  /*
   * A qué inquilino pertenece esta petición, y por tanto a qué base conectarse.
   *
   * Con `CONTROL_DATABASE_URL` sin poner esto no hace nada: `resolveTenant` devuelve
   * `STANDALONE` sin abrir ninguna conexión y todo lo de abajo es lo de siempre. Ésa es la
   * condición para que el plano de control se pueda añadir a una instalación que ya está
   * sirviendo sin que deje de servir.
   */
  const { CONTROL_DATABASE_URL, CONTROL_AUTH_TOKEN } = env;
  const tenant = await resolveTenant(
    CONTROL_DATABASE_URL
      ? () => createControlDb(CONTROL_DATABASE_URL, CONTROL_AUTH_TOKEN)
      : null,
    context.url.host
  );

  /*
   * Un inquilino que existe pero no debe servir.
   *
   * `provisioning` es la ventana entre crear el inquilino y terminar de migrar su base: durante
   * ella el sitio existe y el dominio ya resuelve, así que sin esto un visitante vería una base
   * a medio construir. `suspended` lo corta sin borrar nada.
   *
   * 503 y no 404: el dominio es correcto y el sitio volverá. Un 404 le dice a Google que lo
   * quite del índice, y recuperar eso después de un impago de dos días cuesta semanas.
   */
  if (tenant.tenantId && !isServable(tenant)) {
    return new Response("Este sitio no está disponible ahora mismo.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const db = tenant.database
    ? createDb(tenant.database.url, tenant.database.authToken)
    : createDb(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN);

  /*
   * El id del sitio.
   *
   * Si el plano de control ha reclamado el dominio, es él quien manda. Si no —porque no hay
   * plano de control, o porque lo hay pero este dominio todavía no está dado de alta— se cae al
   * camino de siempre, que lo busca en `sites.host`. Eso es lo que permite adoptar el plano de
   * control inquilino a inquilino en vez de todo de golpe.
   */
  const siteId = tenant.tenantId ? tenant.siteId : await resolveSiteId(db, context.url.host);

  // One round trip for both rows. leftJoin and not innerJoin because a site can exist
  // before ensureBootstrap has written its settings, and losing the site row in that
  // window would take `defaultLocale` with it.
  const [row] = await db
    .select({ site: sites, settings: settings })
    .from(sites)
    .leftJoin(settings, eq(settings.siteId, sites.id))
    .where(eq(sites.id, siteId))
    .limit(1);

  const siteSettings = row?.settings ?? null;
  const integrations = (siteSettings?.integrations as Record<string, string> | null) ?? {};

  /*
   * El `baseURL` de Better Auth, que con varios dominios no puede ser una constante.
   *
   * La decisión vive en `authBaseUrl` y no aquí porque tiene dos filos —si es demasiado fija
   * nadie entra, si es demasiado laxa se pueden fabricar enlaces de correo hacia otro dominio—
   * y dentro del middleware no hay forma de probarla.
   */
  const auth = createAuth(db, integrations.resendApiKey, integrations.resendFrom, {
    // El secreto sí se pasa siempre: en Workers `process.env` no se rellena desde los bindings
    // por debajo de la fecha de compatibilidad 2025-04-01, y el respaldo de Better Auth falla
    // en silencio — las sesiones dejan de validar tras un redespliegue.
    secret: env.BETTER_AUTH_SECRET,
    baseURL: authBaseUrl({
      requestOrigin: context.url.origin,
      requestHost: context.url.host,
      claimedByTenant: tenant.tenantId !== null,
      siteHost: row?.site?.host ?? null,
      configured: env.BETTER_AUTH_URL,
    }),
  });

  context.locals.db = db;
  context.locals.siteId = siteId;
  context.locals.tenant = tenant;
  context.locals.auth = auth;
  context.locals.env = env;
  // The R2 bucket is a binding, so it can only come from here.
  context.locals.r2 = env.R2_BUCKET ?? null;
  // Shared so BaseLayout and the page resolver don't each re-query the same row.
  context.locals.settings = siteSettings;
  // Public routes need defaultLocale too, for the hreflang x-default and the locale
  // prefix, so this is no longer admin-only.
  context.locals.site = row?.site ?? null;

  const pathname = context.url.pathname;
  const isAdminRoute = pathname.startsWith("/admin");
  /*
   * El panel de inquilinos.
   *
   * Sólo aquí se abre el plano de control. Abrirlo en todas las peticiones costaría, en
   * desarrollo, un fichero SQLite abierto por página servida — y las públicas, que son las
   * que hay que servir rápido, no lo necesitan para nada.
   */
  const isPanelRoute = pathname.startsWith("/panel") || pathname.startsWith("/_actions/panel.");

  const isAuthRoute = pathname.startsWith("/admin/login");
  const isApiRoute = pathname.startsWith("/api/") || pathname.startsWith("/_actions/");

  /*
   * Dónde se guardan los archivos subidos.
   *
   * R2 en producción y el sistema de ficheros en desarrollo, porque el adaptador de Node no
   * tiene bindings y sin esto no se puede subir ni el logo trabajando en local.
   *
   * Sólo en las rutas que escriben medios: montar el almacén implica un `import()` dinámico de
   * `node:fs`, y una página pública no tiene por qué pagarlo.
   */
  const mediaRoute = isAdminRoute || isApiRoute;
  const resolved = mediaRoute ? await resolveMediaStore(env) : null;
  context.locals.mediaStore = resolved?.store ?? null;
  context.locals.mediaStoreReason = resolved && !resolved.store ? resolved.reason : null;

  context.locals.control =
    isPanelRoute && CONTROL_DATABASE_URL
      ? createControlDb(CONTROL_DATABASE_URL, CONTROL_AUTH_TOKEN)
      : null;

  // Resolving the session is a DB round trip. Public pages never read locals.user, so
  // only pay for it where something actually consumes it.
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  if (isAdminRoute || isApiRoute || isPanelRoute) {
    session = await auth.api.getSession({ headers: context.request.headers });

    // A deactivated user may still hold a valid session cookie. Treat them as signed
    // out rather than trusting the token until it expires.
    if (session?.user) {
      const row = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { disabled: true },
      });
      if (row?.disabled) session = null;
    }
  }

  context.locals.session = session;
  context.locals.user = session?.user ?? null;
  // Resolved once here so the layout and the page don't each re-run the role lookup.
  context.locals.isAdmin = session?.user
    ? await isAdmin(db, session.user.id, siteId)
    : false;

  if (isAdminRoute || isApiRoute) {
    await ensureBootstrap(db, siteId);
  }

  if (!isAdminRoute && !isApiRoute && !isPanelRoute) {
    const redirects = (siteSettings?.redirects as { from: string; to: string; permanent: boolean }[] | null) ?? [];
    const match = redirects.find((r) => r.from === pathname);
    if (match) {
      return context.redirect(match.to, match.permanent ? 301 : 302);
    }
  }

  if ((isAdminRoute || isPanelRoute) && !isAuthRoute && !session) {
    return context.redirect("/admin/login");
  }

  // The R2 host, so img-src can name it instead of allowing every https origin.
  let mediaHost: string | undefined;
  const publicBase = env.R2_PUBLIC_URL;
  if (publicBase) {
    try {
      mediaHost = new URL(publicBase).origin;
    } catch {
      // A malformed value leaves img-src without it, which fails closed.
    }
  }

  const response = await next();

  /*
   * Security headers on the way out.
   *
   * Applied here rather than in a host config so they follow the app to any deployment, and
   * after `next()` so a route that sets its own Content-Type or Cache-Control keeps it.
   *
   * The CSP is report-only for now. Enforcing it before it has been watched in production is
   * how a site silently loses its own JavaScript for every visitor, and the whole point of
   * report-only is that the reports arrive first.
   */
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(name)) response.headers.set(name, value);
  }

  if (context.url.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", HSTS_HEADER);
  }

  /*
   * The backoffice and the API are never stored anywhere.
   *
   * `no-store`, not `max-age=0`: the latter still permits a shared cache to keep a copy and
   * revalidate it, and a stored /admin page at the edge is one editor's view of the site
   * waiting to be served to another. Set here rather than through a route rule because the
   * rules only control the CDN header, not this one.
   */
  if (isAdminRoute || isApiRoute || isPanelRoute) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  }

  // Only on documents: a CSP on a stylesheet or an image is noise in the report endpoint.
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("text/html")) {
    const analytics = (siteSettings?.analyticsIds ?? {}) as Record<string, string>;
    const csp = buildCsp({
      allowAnalytics: Object.values(analytics).some((v) => typeof v === "string" && v.trim()),
      ...(mediaHost ? { mediaHost } : {}),
    });
    response.headers.set(CSP_HEADER_REPORT, csp);
  }

  return response;
});
