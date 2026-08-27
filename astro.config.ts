import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
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
