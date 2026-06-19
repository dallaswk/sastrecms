import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import vue from "@astrojs/vue";
import tailwind from "@astrojs/tailwind";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const src = resolve(root, "src");

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
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
