import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, and, desc, isNotNull, inArray } from "drizzle-orm";
import { nodes, contentTypes } from "@db/schema";
import { generateId, slugify, computePath, reservedSlugError } from "@lib/id";
import { requirePermission, viewableContentTypeIds } from "@lib/permissions";
import { sanitizeFields } from "@lib/sanitize";
import { invalidateNode } from "@lib/cache-invalidate";

const NodeSeoSchema = z.object({
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  ogImage: z.string().optional(),
  noindex: z.boolean().optional(),
  canonical: z.string().optional(),
});

export const nodeActions = {
  list: defineAction({
    input: z.object({
      contentTypeId: z.string().optional(),
      status: z.enum(["draft", "published", "scheduled"]).optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const conditions = [eq(nodes.siteId, siteId)];
      if (input.contentTypeId) {
        conditions.push(eq(nodes.contentTypeId, input.contentTypeId));
      }
      if (input.status) {
        conditions.push(eq(nodes.status, input.status));
      }

      const [rows, viewable] = await Promise.all([
        db.query.nodes.findMany({
          where: and(...conditions),
          orderBy: desc(nodes.updatedAt),
          with: { contentType: true },
        }),
        viewableContentTypeIds(db, context.locals.user.id, siteId),
      ]);

      // Same rule the MCP listing applies, so the two surfaces cannot disagree about
      // what a given account is allowed to see.
      return rows.filter((n) => viewable.has(n.contentTypeId));
    },
  }),

  get: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)),
        with: { contentType: true },
      });

      if (!node) throw new Error("Node not found");
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "view");
      return node;
    },
  }),

  create: defineAction({
    input: z.object({
      contentTypeId: z.string(),
      parentId: z.string().nullable().optional(),
      title: z.string().min(1),
      slug: z.string().optional(),
      locale: z.string().default("es"),
      fields: z.record(z.string(), z.unknown()).default({}),
      seo: NodeSeoSchema.optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      const db = context.locals.db;
      await requirePermission(db, context.locals.user.id, siteId, input.contentTypeId, "create");

      const ct = await db.query.contentTypes.findFirst({
        where: eq(contentTypes.id, input.contentTypeId),
      });
      if (!ct) throw new Error("Content type not found");

      const slug = input.slug ?? slugify(input.title);

      const reserved = reservedSlugError(slug, Boolean(input.parentId));
      if (reserved) throw new Error(reserved);

      let parentPath: string | null = null;

      if (input.parentId) {
        const parent = await db.query.nodes.findFirst({
          where: eq(nodes.id, input.parentId),
        });
        if (!parent) throw new Error("Parent node not found");
        parentPath = parent.path;
      }

      const path = computePath(
        parentPath, slug, input.locale, context.locals.site?.defaultLocale
      );

      const existing = await db.query.nodes.findFirst({
        where: and(eq(nodes.siteId, siteId), eq(nodes.path, path)),
      });
      if (existing) {
        // "index" at root level resolves to the locale root, so the clash is with the
        // home page and "Path / already exists" reads as a non sequitur.
        if (slug === "index" && !input.parentId) {
          throw new Error(
            `El slug "index" es la portada de este idioma (${path}), y ya existe. ` +
              "Usa otro slug, o edita la portada existente."
          );
        }
        throw new Error(`Path "${path}" already exists`);
      }

      const id = generateId("node");
      const now = new Date();

      await db.insert(nodes).values({
        id,
        siteId,
        contentTypeId: input.contentTypeId,
        parentId: input.parentId ?? null,
        locale: input.locale,
        slug,
        path,
        position: 0,
        status: "draft",
        title: input.title,
        fields: sanitizeFields(input.fields),
        seo: input.seo ?? {},
        createdBy: context.locals.user.id,
        createdVia: "web",
        createdAt: now,
        updatedAt: now,
      });

      await invalidateNode(context.cache, {
        siteId,
        nodeId: id,
        contentTypeId: input.contentTypeId,
        parentId: input.parentId ?? null,
      });

      return { id, path };
    },
  }),

  update: defineAction({
    input: z.object({
      id: z.string(),
      title: z.string().min(1).optional(),
      slug: z.string().optional(),
      fields: z.record(z.string(), z.unknown()).optional(),
      seo: NodeSeoSchema.optional(),
      status: z.enum(["draft", "published", "scheduled"]).optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)),
      });
      if (!node) throw new Error("Node not found");
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "edit");

      // Writing `status` through update was a way around the publish permission that
      // nodes.publish enforces. Any status transition — including unpublishing — needs it.
      if (input.status && input.status !== node.status) {
        await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "publish");
      }

      const updates: Partial<typeof node> = { updatedAt: new Date() };

      if (input.title) updates.title = input.title;
      if (input.fields) updates.fields = sanitizeFields(input.fields);
      if (input.seo) updates.seo = input.seo;
      if (input.status) updates.status = input.status;

      if (input.slug && input.slug !== node.slug) {
        const newSlug = slugify(input.slug);

        const reserved = reservedSlugError(newSlug, Boolean(node.parentId));
        if (reserved) throw new Error(reserved);

        // For a nested node this is the parent path, prefix included; for a root-level
        // one it is null and the locale prefix gets reapplied from scratch.
        const parentPath = node.path.substring(0, node.path.lastIndexOf("/")) || null;
        const newPath = computePath(
          parentPath, newSlug, node.locale, context.locals.site?.defaultLocale
        );

        const existing = await db.query.nodes.findFirst({
          where: and(eq(nodes.siteId, siteId), eq(nodes.path, newPath)),
        });
        if (existing && existing.id !== input.id) {
          throw new Error(`Path "${newPath}" already exists`);
        }

        updates.slug = newSlug;
        updates.path = newPath;
      }

      await db.update(nodes).set(updates).where(eq(nodes.id, input.id));

      await invalidateNode(context.cache, {
        siteId,
        nodeId: input.id,
        contentTypeId: node.contentTypeId,
        parentId: node.parentId,
      });

      return { id: input.id };
    },
  }),

  publish: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)),
      });
      if (!node) throw new Error("Node not found");
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "publish");

      const now = new Date();
      await db
        .update(nodes)
        .set({ status: "published", publishedAt: now, updatedAt: now })
        .where(eq(nodes.id, input.id));

      // The type tag matters most here: publishing a post has to drop the listing and every
      // page with a `collection` block pointing at that type, not only the post's own page.
      await invalidateNode(context.cache, {
        siteId,
        nodeId: input.id,
        contentTypeId: node.contentTypeId,
        parentId: node.parentId,
      });

      return { id: input.id, publishedAt: now };
    },
  }),

  delete: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const children = await db.query.nodes.findMany({
        where: eq(nodes.parentId, input.id),
      });
      if (children.length > 0) {
        throw new Error("Cannot delete a node that has children");
      }

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)),
      });
      if (!node) throw new Error("Node not found");
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "delete");

      await db
        .delete(nodes)
        .where(and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)));

      await invalidateNode(context.cache, {
        siteId,
        nodeId: input.id,
        contentTypeId: node.contentTypeId,
        parentId: node.parentId,
      });

      return { id: input.id };
    },
  }),

  linkTranslation: defineAction({
    input: z.object({
      nodeId: z.string(),
      targetId: z.string(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      if (input.nodeId === input.targetId) throw new Error("Un nodo no puede vincularse consigo mismo");

      const [nodeA, nodeB] = await Promise.all([
        db.query.nodes.findFirst({ where: and(eq(nodes.id, input.nodeId), eq(nodes.siteId, siteId)) }),
        db.query.nodes.findFirst({ where: and(eq(nodes.id, input.targetId), eq(nodes.siteId, siteId)) }),
      ]);
      if (!nodeA || !nodeB) throw new Error("Nodo no encontrado");

      if (nodeA.locale === nodeB.locale) throw new Error("Ambos nodos tienen el mismo idioma");

      const groupId = nodeA.translationGroupId ?? nodeB.translationGroupId ?? generateId("tg");

      await Promise.all([
        db.update(nodes).set({ translationGroupId: groupId }).where(eq(nodes.id, nodeA.id)),
        db.update(nodes).set({ translationGroupId: groupId }).where(eq(nodes.id, nodeB.id)),
      ]);

      return { groupId };
    },
  }),

  unlinkTranslation: defineAction({
    input: z.object({ nodeId: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.nodeId), eq(nodes.siteId, siteId)),
      });
      if (!node) throw new Error("Nodo no encontrado");

      if (!node.translationGroupId) return { ok: true };

      const siblings = await db.query.nodes.findMany({
        where: and(
          eq(nodes.translationGroupId, node.translationGroupId),
          isNotNull(nodes.locale)
        ),
      });

      await db.update(nodes).set({ translationGroupId: null }).where(eq(nodes.id, node.id));

      if (siblings.filter((s) => s.id !== node.id).length === 1) {
        await db
          .update(nodes)
          .set({ translationGroupId: null })
          .where(eq(nodes.translationGroupId, node.translationGroupId));
      }

      return { ok: true };
    },
  }),

  reorder: defineAction({
    input: z.object({
      items: z.array(z.object({
        id: z.string(),
        position: z.number(),
        parentId: z.string().nullable().optional(),
      })),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const affectedIds = input.items.map((i) => i.id);
      const allAffected = await db.query.nodes.findMany({
        where: and(eq(nodes.siteId, siteId), inArray(nodes.id, affectedIds)),
      });

      const allNodes = await db.query.nodes.findMany({
        where: eq(nodes.siteId, siteId),
      });
      const defaultLocale = context.locals.site?.defaultLocale;
      const nodeById = Object.fromEntries(allNodes.map((n) => [n.id, n]));
      const pathById = Object.fromEntries(allNodes.map((n) => [n.id, n.path]));

      // Track parentId changes per node
      const newParentById: Record<string, string | null | undefined> = {};
      for (const item of input.items) {
        newParentById[item.id] = item.parentId;
      }

      // Reject cycles. SortableJS prevents this in the UI, but a direct call could move
      // a node under its own descendant and detach that whole subtree from the root,
      // making it unreachable from the tree and from path resolution.
      const childrenOf = new Map<string | null, string[]>();
      for (const n of allNodes) {
        const key = n.parentId ?? null;
        childrenOf.set(key, [...(childrenOf.get(key) ?? []), n.id]);
      }
      function isDescendant(candidateId: string, ancestorId: string): boolean {
        const stack = [...(childrenOf.get(ancestorId) ?? [])];
        while (stack.length > 0) {
          const current = stack.pop()!;
          if (current === candidateId) return true;
          stack.push(...(childrenOf.get(current) ?? []));
        }
        return false;
      }
      for (const item of input.items) {
        const target = item.parentId;
        if (target === undefined || target === null) continue;
        if (target === item.id) throw new Error("Un nodo no puede ser su propio padre");
        if (isDescendant(target, item.id)) {
          const node = nodeById[item.id];
          throw new Error(
            `No se puede mover "${node?.title ?? item.id}" dentro de su propio contenido`
          );
        }
      }

      // Collect all path changes (node + descendants) for nodes that moved under a new parent
      const pathUpdates: Record<string, { newPath: string; newParentId: string | null }> = {};

      for (const item of input.items) {
        const node = nodeById[item.id];
        if (!node) continue;

        const newParentId = item.parentId;
        const oldParentId = node.parentId ?? null;
        if (newParentId === undefined || newParentId === oldParentId) continue;

        const parentPath = newParentId ? pathById[newParentId] : "";
        const newPath = computePath(parentPath, node.slug, node.locale, defaultLocale);
        if (newPath === node.path) continue;

        const oldPath = node.path;
        pathUpdates[node.id] = { newPath, newParentId };

        // Update descendants paths that start with oldPath
        for (const child of allNodes) {
          if (child.id === node.id) continue;
          if (child.path === oldPath || child.path.startsWith(oldPath + "/")) {
            const suffix = child.path.slice(oldPath.length);
            pathUpdates[child.id] = { newPath: newPath + suffix, newParentId: child.parentId ?? null };
          }
        }
      }

      // Every node the client asked to move needs "edit". This covers the reparented
      // ones too: they are all in input.items, so a second loop over pathUpdates would
      // only repeat work.
      for (const item of input.items) {
        const node = nodeById[item.id];
        if (!node) continue;
        await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "edit");
      }

      // Check path uniqueness for the moved nodes (excluding unchanged descendants)
      for (const [id, { newPath }] of Object.entries(pathUpdates)) {
        const existing = allNodes.find(
          (n) => n.siteId === siteId && n.path === newPath && n.id !== id
        );
        if (existing) throw new Error(`Path "${newPath}" already exists`);
      }

      // Execute updates
      const now = new Date();
      await Promise.all(
        input.items.map(({ id, position, parentId }) => {
          const pathUpdate = pathUpdates[id];
          const set: Record<string, unknown> = {
            position,
            updatedAt: now,
            ...(parentId !== undefined ? { parentId } : {}),
            ...(pathUpdate ? { path: pathUpdate.newPath } : {}),
          };
          return db.update(nodes).set(set).where(and(eq(nodes.id, id), eq(nodes.siteId, siteId)));
        })
      );

      // Update descendants paths that changed due to parent move
      await Promise.all(
        Object.entries(pathUpdates)
          .filter(([id]) => !affectedIds.includes(id))
          .map(([id, { newPath }]) =>
            db
              .update(nodes)
              .set({ path: newPath, updatedAt: now })
              .where(and(eq(nodes.id, id), eq(nodes.siteId, siteId)))
          )
      );

      return { ok: true };
    },
  }),

  listForPicker: defineAction({
    input: z.object({
      excludeId: z.string().optional(),
      locale: z.string().optional(),
      /** Restricts to one content type, for a relation field's `relatedContentType`. */
      contentTypeKey: z.string().optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const all = await db.query.nodes.findMany({
        where: eq(nodes.siteId, siteId),
        orderBy: (n, { asc }) => [asc(n.path)],
        with: { contentType: { columns: { key: true } } },
      });

      const viewable = await viewableContentTypeIds(db, context.locals.user.id, siteId);

      return all
        .filter((n) => viewable.has(n.contentTypeId))
        .filter((n) => n.id !== input.excludeId)
        .filter((n) => !input.locale || n.locale === input.locale)
        .filter((n) => !input.contentTypeKey || n.contentType?.key === input.contentTypeKey)
        .map((n) => ({
          id: n.id,
          title: n.title,
          path: n.path,
          locale: n.locale,
          // The relation field needs it to label options; the translation picker ignores it.
          contentTypeKey: n.contentType?.key ?? null,
        }));
    },
  }),
};
