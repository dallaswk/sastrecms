/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

/**
 * Minimal shape of the R2 binding: only what src/actions/media.ts uses.
 * @cloudflare/workers-types is a devDependency of the adapter, not installed here, so
 * declaring the slice we need beats pulling in a package that redefines fetch, Request
 * and Response globally.
 */
interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string | null,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
}

interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  R2_BUCKET: R2Bucket;
  R2_PUBLIC_URL: string;
  RESEND_API_KEY: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

/**
 * What loadEnv() in src/middleware.ts returns. The index signature is `unknown` on
 * purpose: the environment carries bindings as well as strings, and pretending
 * otherwise is how R2_BUCKET ended up being read through the wrong door.
 */
interface RuntimeEnv {
  [key: string]: unknown;
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  /** El plano de control. Sin esto, la aplicación se comporta como mono-inquilino. */
  CONTROL_DATABASE_URL?: string;
  CONTROL_AUTH_TOKEN?: string;
  /** El secreto de firma del webhook de Stripe (`whsec_…`). Sin él no se acepta ninguno. */
  STRIPE_WEBHOOK_SECRET?: string;
  R2_PUBLIC_URL?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  R2_BUCKET?: R2Bucket;
}

declare module "cloudflare:workers" {
  export const env: Env;
}

/**
 * Astro does not ship an ambient declaration for .astro modules, and
 * src/components/sections/index.ts imports them so the section renderer can dispatch by
 * type. Typing them as AstroComponentFactory is enough for that map; nothing type-checks
 * their props through it, which is why a test compares its keys against the registry.
 */
declare module "*.astro" {
  const Component: (props: Record<string, unknown>) => unknown;
  export default Component;
}

declare namespace App {
  interface Locals extends Runtime {
    db: import("@db/client").Database;
    auth: import("@/lib/auth").Auth;
    /** Runtime environment, resolved once per request by the middleware. */
    env: RuntimeEnv;
    /** The R2 bucket binding, or null when it isn't configured (local dev). */
    r2: R2Bucket | null;
    /**
     * Dónde se guardan los archivos subidos: R2 en producción, disco en desarrollo.
     * Nulo sólo si no hay ninguno de los dos, y entonces `mediaStoreReason` dice por qué.
     */
    mediaStore: import("@lib/media-store").MediaStore | null;
    mediaStoreReason: string | null;
    /** Site settings row, loaded once per request and shared with the layout. */
    settings: typeof import("@db/schema").settings.$inferSelect | null;
    /** Which site this request is for. Never hardcode the id — read it from here. */
    siteId: string;
    /** El inquilino resuelto por dominio. `tenantId` nulo = sin plano de control. */
    tenant: import("@lib/tenant").ResolvedTenant;
    /** El plano de control. Sólo en las rutas del panel; nulo en el resto y sin configurar. */
    control: import("@db/control-client").ControlDatabase | null;
    /** The site row. Only loaded on /admin and API routes, which are the ones that need it. */
    site: typeof import("@db/schema").sites.$inferSelect | null;
    session: { session: import("better-auth").Session; user: import("better-auth").User } | null;
    user: import("better-auth").User | null;
    /** True when the signed-in user holds the admin role on this site. */
    isAdmin: boolean;
  }
}
