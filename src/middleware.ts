import { defineMiddleware } from "astro:middleware";
import { createDb } from "@db/client";
import { createAuth } from "@/lib/auth";

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

  const isAdminRoute = context.url.pathname.startsWith("/admin");
  const isAuthRoute = context.url.pathname.startsWith("/admin/login");

  if (isAdminRoute && !isAuthRoute && !session) {
    return context.redirect("/admin/login");
  }

  return next();
});
