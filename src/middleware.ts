import { defineMiddleware } from "astro:middleware";
import { eq } from "drizzle-orm";
import { createDb, type Database } from "@db/client";
import { createAuth } from "@lib/auth";
import { isAdmin } from "@lib/permissions";
import { sites, settings, roles, users } from "@db/schema";

async function loadEnv(): Promise<Record<string, string | undefined>> {
  try {
    const { env } = await import("cloudflare:workers");
    return (env ?? {}) as unknown as Record<string, string | undefined>;
  } catch {
    const { default: dotenv } = await import("dotenv");
    dotenv.config();
    return process.env;
  }
}

const SITE_ID = "site_default";

/**
 * The site row and the base roles only ever need creating once. Running this on every
 * request cost two extra Turso round trips per page, including anonymous public pages
 * that touch none of it. The flag lives for the life of the isolate, which is exactly
 * the scope we need: a fresh isolate re-checks, a warm one doesn't.
 */
let bootstrapped = false;

async function ensureBootstrap(db: Database) {
  if (bootstrapped) return;

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
    await db.insert(roles).values([
      { id: "role_admin", siteId: SITE_ID, key: "admin", label: "Admin" },
      { id: "role_editor", siteId: SITE_ID, key: "editor", label: "Editor" },
      { id: "role_collaborator", siteId: SITE_ID, key: "collaborator", label: "Colaborador" },
    ]).onConflictDoNothing();
  }

  bootstrapped = true;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const env = await loadEnv();
  const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = env;
  if (!TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL is not set");

  const db = createDb(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN);

  const siteSettings = await db.query.settings.findFirst({
    where: eq(settings.siteId, SITE_ID),
  });
  const integrations = (siteSettings?.integrations as Record<string, string> | null) ?? {};

  // Better Auth reads `secret` and `baseURL` from process.env when they aren't passed
  // in. On Workers process.env is not populated from bindings below compat date
  // 2025-04-01, which is why loadEnv() exists at all — so hand them over explicitly
  // instead of hoping the fallback finds them in production.
  const auth = createAuth(db, integrations.resendApiKey, integrations.resendFrom, {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL ?? context.url.origin,
  });

  context.locals.db = db;
  context.locals.auth = auth;
  context.locals.env = env;
  // Shared so BaseLayout and the page resolver don't each re-query the same row.
  context.locals.settings = siteSettings ?? null;

  const pathname = context.url.pathname;
  const isAdminRoute = pathname.startsWith("/admin");
  const isAuthRoute = pathname.startsWith("/admin/login");
  const isApiRoute = pathname.startsWith("/api/") || pathname.startsWith("/_actions/");

  // Resolving the session is a DB round trip. Public pages never read locals.user, so
  // only pay for it where something actually consumes it.
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  if (isAdminRoute || isApiRoute) {
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
    ? await isAdmin(db, session.user.id, SITE_ID)
    : false;

  if (isAdminRoute || isApiRoute) {
    await ensureBootstrap(db);
  }

  if (!isAdminRoute && !isApiRoute) {
    const redirects = (siteSettings?.redirects as { from: string; to: string; permanent: boolean }[] | null) ?? [];
    const match = redirects.find((r) => r.from === pathname);
    if (match) {
      return context.redirect(match.to, match.permanent ? 301 : 302);
    }
  }

  if (isAdminRoute && !isAuthRoute && !session) {
    return context.redirect("/admin/login");
  }

  return next();
});
