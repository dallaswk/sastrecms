/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  R2_BUCKET: R2Bucket;
  R2_PUBLIC_URL: string;
  RESEND_API_KEY: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

declare module "cloudflare:workers" {
  export const env: Env;
}

declare namespace App {
  interface Locals extends Runtime {
    db: import("@db/client").Database;
    auth: import("@/lib/auth").Auth;
    /** Runtime environment, resolved once per request by the middleware. */
    env: Record<string, string | undefined>;
    /** Site settings row, loaded once per request and shared with the layout. */
    settings: typeof import("@db/schema").settings.$inferSelect | null;
    /** Which site this request is for. Never hardcode the id — read it from here. */
    siteId: string;
    /** The site row. Only loaded on /admin and API routes, which are the ones that need it. */
    site: typeof import("@db/schema").sites.$inferSelect | null;
    session: { session: import("better-auth").Session; user: import("better-auth").User } | null;
    user: import("better-auth").User | null;
    /** True when the signed-in user holds the admin role on this site. */
    isAdmin: boolean;
  }
}
