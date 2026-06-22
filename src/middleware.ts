import { defineMiddleware } from "astro:middleware";
import { eq } from "drizzle-orm";
import { createDb, type Database } from "@db/client";
import { createAuth } from "@lib/auth";
import { sites, settings, roles } from "@db/schema";

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

async function ensureBootstrap(db: Database) {
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
  const auth = createAuth(db, integrations.resendApiKey, integrations.resendFrom);

  await ensureBootstrap(db);

  context.locals.db = db;
  context.locals.auth = auth;

  const session = await auth.api.getSession({
    headers: context.request.headers,
  });

  context.locals.session = session;
  context.locals.user = session?.user ?? null;

  const pathname = context.url.pathname;
  const isAdminRoute = pathname.startsWith("/admin");
  const isAuthRoute = pathname.startsWith("/admin/login");
  const isApiRoute = pathname.startsWith("/api/") || pathname.startsWith("/_actions/");

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
