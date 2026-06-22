import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import node from "@astrojs/node";
import vue from "@astrojs/vue";
import tailwind from "@astrojs/tailwind";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const src = resolve(root, "src");

const isCloudflare = process.env.CF_PAGES || process.argv.includes("build");

export default defineConfig({
  output: "server",
  adapter: isCloudflare
    ? cloudflare({
        platformProxy: {
          enabled: true,
        },
      })
    : node({ mode: "standalone" }),
  integrations: [
    vue(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
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
