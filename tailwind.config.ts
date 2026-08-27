import type { Config } from "tailwindcss";
import daisyui from "daisyui";
// Relative, not the @lib alias: this file is loaded by PostCSS in a plain Node process
// where the alias does not exist. The list of themes lives there so the settings selector
// and the compiled stylesheet cannot disagree — offering 32 while compiling 2 meant 30 of
// the choices silently did nothing.
import { SITE_THEMES } from "./src/lib/theme";

export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      fontFamily: {
        // Set from the site's settings at render time. The fallback matters: the admin
        // pages never define these vars.
        sans: ["var(--font-body, ui-sans-serif)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading, ui-sans-serif)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: [...SITE_THEMES],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
  },
} satisfies Config;
