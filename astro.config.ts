import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import node from "@astrojs/node";
import vue from "@astrojs/vue";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const src = resolve(root, "src");

/**
 * Which adapter to build against.
 *
 * SASTRE_ADAPTER wins when set. Without it the historical behaviour is kept: Cloudflare
 * on CF Pages and for any build, Node for local dev. That inference read process.argv,
 * which meant `astro build` could never target Node — so the one thing you could not
 * build was the configuration the dev server actually runs.
 */
const inferred =
  process.env.CF_PAGES || process.argv.includes("build") ? "cloudflare" : "node";
const target = process.env.SASTRE_ADAPTER ?? inferred;

if (target !== "cloudflare" && target !== "node") {
  throw new Error(
    `SASTRE_ADAPTER must be "cloudflare" or "node", received ${JSON.stringify(target)}`
  );
}

/**
 * Which hosts `/_image` may fetch from.
 *
 * Never `{ protocol: "https" }` on its own: that turns the Worker into an open image proxy
 * that anybody can point at any URL on the internet, on this site's bandwidth and with this
 * site's IP. Only the deployment's own R2 host is allowed, read at build time — with none
 * configured the list stays empty and `/_image` refuses remote sources, which is the right
 * way to fail.
 */
function r2RemotePattern() {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return [];
  try {
    const { protocol, hostname } = new URL(raw);
    if (protocol !== "https:" && protocol !== "http:") return [];
    return [{ protocol: protocol.replace(":", "") as "http" | "https", hostname }];
  } catch {
    return [];
  }
}

export default defineConfig({
  output: "server",
  /*
   * Edge caching.
   *
   * `cacheCloudflare()` uses Cloudflare-CDN-Cache-Control and Cache-Tag, and purges by tag
   * through the Worker cache API — no API credentials, which is why this and not a manual
   * `caches.default` (per data centre, no tag purge) or KV (eventually consistent, and adds
   * nothing over HTTP caching for HTML).
   *
   * Only configured for the Cloudflare target: under the Node adapter the provider would be
   * a noop and the route rules would be misleading.
   *
   * Consequence to keep in mind: a cached public response must not vary by cookie and must
   * not carry Set-Cookie, or Workers Cache silently ignores it. That is precisely why the
   * cookie consent in D3 is entirely client-side.
   */
  ...(target === "cloudflare" ? { cache: { provider: cacheCloudflare() } } : {}),
  routeRules: {
    // The floor for public pages. Individual routes tighten this with Astro.cache.set().
    "/[...slug]": { maxAge: 3600, swr: 86400 },
    // Derived from the database but changes rarely, and both carry their own ETag.
    "/sitemap.xml": { maxAge: 3600, swr: 86400 },
    "/robots.txt": { maxAge: 3600, swr: 86400 },
    // Needs its own rule: the `/[...slug]` catch-all matched it and overwrote the
    // year-long immutable header with an hour, which defeats the point of putting the
    // fingerprint in the URL in the first place.
    "/theme.css": { maxAge: 31536000 },
    /*
     * The backoffice, the API and the actions.
     *
     * These have to be listed: without a rule the `/[...slug]` catch-all matched them and
     * the provider emitted `max-age=3600` for the edge, which would have cached one editor's
     * view of the backoffice for an hour. Found by reading the headers under workerd, not by
     * reasoning about the config.
     *
     * `maxAge: 0` is the strongest the RouteRule type offers — there is no `no-store` option
     * — and it does mean the edge must revalidate on every request, so a stale admin page can
     * never be served. The middleware also sets `Cache-Control: private, no-store`, which is
     * what browsers and any non-Cloudflare proxy honour.
     */
    "/admin": { maxAge: 0 },
    "/admin/[...path]": { maxAge: 0 },
    "/api/[...path]": { maxAge: 0 },
    "/_actions/[...path]": { maxAge: 0 },
  },
  image: {
    // The Cloudflare adapter already defaults imageService to `cloudflare-binding`; what was
    // missing was the allowlist, and without it every remote source is a 403.
    remotePatterns: r2RemotePattern(),
  },
  // No platformProxy: @astrojs/cloudflare v13 accepts only auxiliaryWorkers, configPath,
  // inspectorPort, persistState and remoteBindings from the Vite plugin, plus its own
  // image and session options. Passing platformProxy did nothing at all — local bindings
  // come from wrangler.toml through the Vite plugin now.
  adapter: target === "cloudflare" ? cloudflare() : node({ mode: "standalone" }),
  // Tailwind is wired through postcss.config.mjs, which Vite loads on its own.
  // @astrojs/tailwind only existed to do that, and its peer range stops at Astro 5.
  integrations: [vue()],
  vite: {
    resolve: {
      alias: {
        "@": src,
        "@db": resolve(src, "db"),
        "@actions": resolve(src, "actions"),
        "@components": resolve(src, "components"),
        "@layouts": resolve(src, "layouts"),
        "@lib": resolve(src, "lib"),
        "@pages": resolve(src, "pages"),
        "@styles": resolve(src, "styles"),
      },
    },
    ssr: {
      external: ["@libsql/client"],
    },
  },
});
