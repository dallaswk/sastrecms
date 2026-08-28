import type { Config } from "tailwindcss";
import daisyui from "daisyui";
import typography from "@tailwindcss/typography";
// Relative, not the @lib alias: this file is loaded by PostCSS in a plain Node process
// where the alias does not exist. The list of themes lives there so the settings selector
// and the compiled stylesheet cannot disagree — offering 32 while compiling 2 meant 30 of
// the choices silently did nothing.
import { SITE_THEMES, ADMIN_THEME_DEFINITIONS } from "./src/lib/theme";

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
      /*
       * `prose` repainted in daisyUI's tokens.
       *
       * The plugin ships a fixed grey scale — body text at gray-700, headings at gray-900 —
       * which is legible on white and nearly invisible on any of the dark themes, admin
       * included. Binding the variables to `--bc` and `--p` means one rule follows whatever
       * theme is active instead of needing a `prose-invert` at every call site.
       */
      typography: {
        DEFAULT: {
          css: {
            "--tw-prose-body": "oklch(var(--bc) / 0.85)",
            "--tw-prose-headings": "oklch(var(--bc))",
            "--tw-prose-lead": "oklch(var(--bc) / 0.75)",
            "--tw-prose-links": "oklch(var(--p))",
            "--tw-prose-bold": "oklch(var(--bc))",
            "--tw-prose-counters": "oklch(var(--bc) / 0.6)",
            "--tw-prose-bullets": "oklch(var(--bc) / 0.35)",
            "--tw-prose-hr": "oklch(var(--bc) / 0.2)",
            "--tw-prose-quotes": "oklch(var(--bc) / 0.85)",
            "--tw-prose-quote-borders": "oklch(var(--bc) / 0.2)",
            "--tw-prose-captions": "oklch(var(--bc) / 0.6)",
            "--tw-prose-code": "oklch(var(--bc))",
            "--tw-prose-pre-code": "oklch(var(--bc) / 0.9)",
            "--tw-prose-pre-bg": "oklch(var(--b2))",
            "--tw-prose-th-borders": "oklch(var(--bc) / 0.3)",
            "--tw-prose-td-borders": "oklch(var(--bc) / 0.15)",
          },
        },
      },
    },
  },
  // typography before daisyui: every `prose` block in the admin editor and in the public
  // renderers depends on it. Without it Tailwind's preflight had already stripped headings,
  // lists and quotes back to plain paragraphs, so the WYSIWYG looked like a plain input.
  plugins: [typography, daisyui],
  daisyui: {
    // The site's themes plus the backoffice's own two. Kept in one array because daisyUI
    // takes one, but the settings selector only ever offers SITE_THEMES — an editor must not
    // be able to put the admin palette on a client's website.
    themes: [...SITE_THEMES, ...ADMIN_THEME_DEFINITIONS],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
  },
} satisfies Config;
