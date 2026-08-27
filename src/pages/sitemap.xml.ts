import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";
import { nodes } from "@db/schema";
import { visibleNodes } from "@lib/node-queries";

export const prerender = false;

export const GET: APIRoute = async ({ locals, site, url }) => {
  const db = locals.db;
  const siteId = locals.siteId;
  const baseUrl = site?.origin ?? url.origin;

  const publishedNodes = await db.query.nodes.findMany({
    where: visibleNodes(siteId, new Date()),
    orderBy: (n, { desc }) => [desc(n.updatedAt)],
  });

  const entries = publishedNodes
    .map((node) => {
      const seo = (node.seo as Record<string, unknown>) ?? {};
      if (seo.noindex) return null;
      const lastmod = (node.updatedAt ?? node.publishedAt ?? node.createdAt) as Date | null;
      // Priority by depth, and the home page above everything. It is a hint, not a ranking
      // factor — but a flat sitemap tells a crawler nothing about what the site is for.
      const depth = node.path === "/" ? 0 : node.path.split("/").filter(Boolean).length;
      const priority = node.path === "/" ? "1.0" : Math.max(0.3, 0.8 - (depth - 1) * 0.2).toFixed(1);
      return `  <url>
    <loc>${baseUrl}${node.path}</loc>${lastmod ? `\n    <lastmod>${lastmod.toISOString().split("T")[0]}</lastmod>` : ""}
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
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
