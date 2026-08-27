import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const baseUrl = url.origin;

  /*
   * `Allow: /` alone let the backoffice and the API into the index.
   *
   * The pages there already send `noindex`, but robots.txt is what stops the crawl in the
   * first place — a login form and an action endpoint being requested by every bot on the
   * internet is wasted work at best, and `/_actions/` is a POST surface nothing should be
   * probing.
   */
  const content = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /_actions/

Sitemap: ${baseUrl}/sitemap.xml
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Short: a site going live changes this, and a day-long cache would keep it crawled
      // or uncrawled for a day after the change.
      "Cache-Control": "public, max-age=3600",
    },
  });
};
