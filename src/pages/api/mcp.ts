import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";
import { nodes, contentTypes, media, settings } from "@db/schema";
import { validateApiToken } from "@lib/api-token";
import { generateId, slugify, computePath } from "@lib/id";
import {
  requirePermission,
  isAdmin,
  viewableContentTypeIds,
} from "@lib/permissions";

export const prerender = false;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mcpError(message: string, status = 400) {
  return json({ error: message }, status);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return mcpError("Missing or invalid Authorization header", 401);
  }

  const rawToken = authHeader.slice(7);
  const tokenResult = await validateApiToken(locals.db, rawToken);
  if (!tokenResult) {
    return mcpError("Invalid or revoked API token", 401);
  }

  let body: { tool: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return mcpError("Invalid JSON body");
  }

  const { tool, params = {} } = body;
  const db = locals.db;
  const siteId = locals.siteId;
  const userId = tokenResult.userId;

  try {
    switch (tool) {
      case "list_content_types": {
        const cts = await db.query.contentTypes.findMany({
          where: eq(contentTypes.siteId, siteId),
        });
        const viewable = await viewableContentTypeIds(db, userId, siteId);
        return json({ result: cts.filter((ct) => viewable.has(ct.id)) });
      }

      case "list_nodes": {
        const { contentTypeId, status } = params as { contentTypeId?: string; status?: string };
        const conditions = [eq(nodes.siteId, siteId)];
        if (contentTypeId) conditions.push(eq(nodes.contentTypeId, contentTypeId as string));
        if (status) conditions.push(eq(nodes.status, status as "draft" | "published" | "scheduled"));
        const list = await db.query.nodes.findMany({
          where: and(...conditions),
          with: { contentType: true },
          orderBy: (n, { desc }) => [desc(n.updatedAt)],
        });
        const viewable = await viewableContentTypeIds(db, userId, siteId);
        return json({ result: list.filter((n) => viewable.has(n.contentTypeId)) });
      }

      case "get_node": {
        const { id, path } = params as { id?: string; path?: string };
        if (!id && !path) return mcpError("id or path required");
        const node = await db.query.nodes.findFirst({
          where: and(
            eq(nodes.siteId, siteId),
            id ? eq(nodes.id, id) : eq(nodes.path, path!)
          ),
          with: { contentType: true },
        });
        if (!node) return mcpError("Node not found", 404);
        await requirePermission(db, userId, siteId, node.contentTypeId, "view");
        return json({ result: node });
      }

      case "create_node": {
        const { contentTypeId, title, slug: rawSlug, parentId, locale = "es", fields = {}, seo = {} } =
          params as { contentTypeId: string; title: string; slug?: string; parentId?: string; locale?: string; fields?: Record<string, unknown>; seo?: Record<string, unknown> };

        if (!contentTypeId || !title) return mcpError("contentTypeId and title are required");

        const ct = await db.query.contentTypes.findFirst({ where: eq(contentTypes.id, contentTypeId) });
        if (!ct) return mcpError("Content type not found", 404);
        await requirePermission(db, userId, siteId, contentTypeId, "create");

        const slug = rawSlug ? slugify(rawSlug) : slugify(title);
        let parentPath: string | null = null;
        if (parentId) {
          const parent = await db.query.nodes.findFirst({ where: eq(nodes.id, parentId) });
          if (!parent) return mcpError("Parent node not found", 404);
          parentPath = parent.path;
        }

        const path = computePath(parentPath, slug, locale, locals.site?.defaultLocale);
        const existing = await db.query.nodes.findFirst({
          where: and(eq(nodes.siteId, siteId), eq(nodes.path, path)),
        });
        if (existing) return mcpError(`Path "${path}" already exists`);

        const id = generateId("node");
        const now = new Date();
        await db.insert(nodes).values({
          id, siteId, contentTypeId, parentId: parentId ?? null,
          locale, slug, path, position: 0, status: "draft",
          title, fields, seo, createdBy: tokenResult.userId,
          createdVia: "mcp", createdAt: now, updatedAt: now,
        });
        return json({ result: { id, path } }, 201);
      }

      case "update_node": {
        const { id, ...updates } = params as { id: string; [k: string]: unknown };
        if (!id) return mcpError("id is required");
        const node = await db.query.nodes.findFirst({
          where: and(eq(nodes.id, id), eq(nodes.siteId, siteId)),
        });
        if (!node) return mcpError("Node not found", 404);
        await requirePermission(db, userId, siteId, node.contentTypeId, "edit");
        // Changing status is publishing, not editing — same rule as nodes.update.
        if (updates.status && updates.status !== node.status) {
          await requirePermission(db, userId, siteId, node.contentTypeId, "publish");
        }

        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (updates.title) patch.title = updates.title;
        if (updates.fields) patch.fields = updates.fields;
        if (updates.seo) patch.seo = updates.seo;
        if (updates.status) patch.status = updates.status;
        if (updates.slug && updates.slug !== node.slug) {
          const newSlug = slugify(updates.slug as string);
          const parentPath = node.path.substring(0, node.path.lastIndexOf("/")) || null;
          patch.slug = newSlug;
          patch.path = computePath(
            parentPath, newSlug, node.locale, locals.site?.defaultLocale
          );
        }
        await db.update(nodes).set(patch).where(eq(nodes.id, id));
        return json({ result: { id } });
      }

      case "publish_node": {
        const { id } = params as { id: string };
        if (!id) return mcpError("id is required");
        const node = await db.query.nodes.findFirst({
          where: and(eq(nodes.id, id), eq(nodes.siteId, siteId)),
        });
        if (!node) return mcpError("Node not found", 404);
        await requirePermission(db, userId, siteId, node.contentTypeId, "publish");
        const now = new Date();
        await db.update(nodes)
          .set({ status: "published", publishedAt: now, updatedAt: now })
          .where(and(eq(nodes.id, id), eq(nodes.siteId, siteId)));
        return json({ result: { id, publishedAt: now } });
      }

      case "delete_node": {
        const { id } = params as { id: string };
        if (!id) return mcpError("id is required");
        const node = await db.query.nodes.findFirst({
          where: and(eq(nodes.id, id), eq(nodes.siteId, siteId)),
        });
        if (!node) return mcpError("Node not found", 404);
        await requirePermission(db, userId, siteId, node.contentTypeId, "delete");
        const children = await db.query.nodes.findMany({ where: eq(nodes.parentId, id) });
        if (children.length > 0) return mcpError("Cannot delete a node that has children");
        await db.delete(nodes).where(and(eq(nodes.id, id), eq(nodes.siteId, siteId)));
        return json({ result: { id } });
      }

      case "list_media": {
        const files = await db.query.media.findMany({
          where: eq(media.siteId, siteId),
          orderBy: (m, { desc }) => [desc(m.createdAt)],
        });
        return json({ result: files });
      }

      case "search_content": {
        const { query } = params as { query: string };
        if (!query) return mcpError("query is required");
        const allNodes = await db.query.nodes.findMany({
          where: eq(nodes.siteId, siteId),
          with: { contentType: true },
        });
        const q = query.toLowerCase();
        const viewable = await viewableContentTypeIds(db, userId, siteId);
        const results = allNodes.filter(
          (n) =>
            viewable.has(n.contentTypeId) &&
            (n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
        );
        return json({ result: results });
      }

      case "get_settings": {
        if (!(await isAdmin(db, userId, siteId))) {
          return mcpError("Forbidden: se requiere rol de administrador", 403);
        }
        const row = await db.query.settings.findFirst({
          where: eq(settings.siteId, siteId),
        });
        return json({ result: row });
      }

      case "update_settings": {
        if (!(await isAdmin(db, userId, siteId))) {
          return mcpError("Forbidden: se requiere rol de administrador", 403);
        }
        const row = await db.query.settings.findFirst({ where: eq(settings.siteId, siteId) });
        const patch: Record<string, unknown> = {};
        const allowed = ["siteName", "tagline", "theme", "socialLinks", "analyticsIds"];
        for (const key of allowed) {
          if (params[key] !== undefined) patch[key] = params[key];
        }
        if (row) {
          await db.update(settings).set(patch).where(eq(settings.siteId, siteId));
        }
        return json({ result: { ok: true } });
      }

      default:
        return mcpError(`Unknown tool: ${tool}`, 404);
    }
  } catch (err: unknown) {
    console.error("[MCP]", err);
    return mcpError(err instanceof Error ? err.message : "Internal error", 500);
  }
};

export const GET: APIRoute = async () => {
  return json({
    name: "sASTRe CMS",
    version: "0.1.0",
    tools: [
      { name: "list_content_types", description: "List all content types" },
      { name: "list_nodes", description: "List nodes, optionally filtered by contentTypeId and status" },
      { name: "get_node", description: "Get a node by id or path" },
      { name: "create_node", description: "Create a new node" },
      { name: "update_node", description: "Update an existing node" },
      { name: "publish_node", description: "Publish a node (sets status=published)" },
      { name: "delete_node", description: "Delete a node (must have no children)" },
      { name: "list_media", description: "List all media files" },
      { name: "search_content", description: "Search nodes by title or path" },
      { name: "get_settings", description: "Get site settings" },
      { name: "update_settings", description: "Update site settings (admin only)" },
    ],
  });
};
