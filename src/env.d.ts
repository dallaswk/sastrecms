/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  R2_BUCKET: R2Bucket;
  RESEND_API_KEY: string;
  BETTER_AUTH_SECRET: string;
}

declare namespace App {
  interface Locals extends Runtime {
    db: import("@db/client").Database;
    auth: import("@/lib/auth").Auth;
    session: import("better-auth").Session | null;
    user: import("better-auth").User | null;
  }
}
