import { defineMiddleware } from "astro:middleware";
import { eq } from "drizzle-orm";
import { createDb } from "@db/client";
import { createAuth } from "@/lib/auth";
import { settings } from "@db/schema";

export const onRequest = defineMiddleware(async (context, next) => {
  const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = context.locals.runtime.env;

  const db = createDb(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN);
  const auth = createAuth(db);

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
    const siteSettings = await db.query.settings.findFirst({
      where: eq(settings.siteId, "site_default"),
    });
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
