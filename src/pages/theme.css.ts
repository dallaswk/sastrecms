import type { APIRoute } from "astro";
import { buildThemeCss, themeFingerprint, type SiteTheme } from "@lib/theme";
import { themeColorValue } from "@lib/color";

export const prerender = false;

/**
 * The site's palette as a real stylesheet instead of an inline `<style>`.
 *
 * Three things this buys, in order of how much they matter:
 *
 * 1. It is what makes a strict CSP possible at all. Astro's native CSP computes hashes at
 *    build time, and an inline block whose contents come from the database per request can
 *    never match one. Moving it out of the document is the prerequisite, not a tidy-up.
 * 2. The palette is downloaded once per visitor instead of on every page.
 * 3. The document gets smaller by exactly the palette, on every page of the site.
 *
 * The URL carries a fingerprint of the theme, so it can be cached forever and still change
 * the moment the owner saves a new colour. Without that, a visitor keeps the old palette
 * until their cache expires — which is the failure mode that makes people distrust caching.
 */
export const GET: APIRoute = async (context) => {
  const theme = (context.locals.settings?.theme ?? {}) as SiteTheme;
  const css = `:root { ${buildThemeCss(theme, themeColorValue)} }\n`;
  const etag = `"${themeFingerprint(theme)}"`;

  // The fingerprint is in the URL, so a request that already has it needs no body.
  if (context.request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return new Response(css, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      ETag: etag,
      // Immutable is safe *because* the fingerprint is in the URL: a changed theme is a
      // different URL, so nothing has to expire for the change to appear.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
