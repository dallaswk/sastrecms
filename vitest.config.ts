import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const src = resolve(root, "src");

// Kept separate from astro.config.ts on purpose: loading that one would pull in the
// Astro integrations and adapters, which the unit tests neither need nor can run.
// The aliases have to mirror it, though — if you add one there, add it here.
export default defineConfig({
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
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
