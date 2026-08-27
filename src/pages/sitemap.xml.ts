import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";
import { nodes } from "@db/schema";

export const prerender = false;

export const GET: APIRoute = async ({ locals, site, url }) => {
  const db = locals.db;
  const siteId = locals.siteId;
  const baseUrl = site?.origin ?? url.origin;

  const publishedNodes = await db.query.nodes.findMany({
    where: and(eq(nodes.siteId, siteId), eq(nodes.status, "published")),
    orderBy: (n, { desc }) => [desc(n.updatedAt)],
  });

  const entries = publishedNodes
    .map((node) => {
      const seo = (node.seo as Record<string, unknown>) ?? {};
      if (seo.noindex) return null;
      const lastmod = (node.updatedAt ?? node.publishedAt ?? node.createdAt) as Date | null;
      return `  <url>
    <loc>${baseUrl}${node.path}</loc>${lastmod ? `\n    <lastmod>${lastmod.toISOString().split("T")[0]}</lastmod>` : ""}
    <changefreq>weekly</changefreq>
  </url>`;
    })
    .filter(Boolean)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
