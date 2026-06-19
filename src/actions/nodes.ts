import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, and, desc } from "drizzle-orm";
import { nodes, contentTypes } from "@db/schema";
import { generateId, slugify, computePath } from "@/lib/id";

const SITE_ID = "site_default";

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
      const db = context.locals.db;

      const conditions = [eq(nodes.siteId, SITE_ID)];
      if (input.contentTypeId) {
        conditions.push(eq(nodes.contentTypeId, input.contentTypeId));
      }
      if (input.status) {
        conditions.push(eq(nodes.status, input.status));
      }

      return db.query.nodes.findMany({
        where: and(...conditions),
        orderBy: desc(nodes.updatedAt),
        with: { contentType: true },
      });
    },
  }),

  get: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, SITE_ID)),
        with: { contentType: true },
      });

      if (!node) throw new Error("Node not found");
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
      fields: z.record(z.unknown()).default({}),
      seo: NodeSeoSchema.optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const db = context.locals.db;

      const ct = await db.query.contentTypes.findFirst({
        where: eq(contentTypes.id, input.contentTypeId),
      });
      if (!ct) throw new Error("Content type not found");

      const slug = input.slug ?? slugify(input.title);
      let parentPath: string | null = null;

      if (input.parentId) {
        const parent = await db.query.nodes.findFirst({
          where: eq(nodes.id, input.parentId),
        });
        if (!parent) throw new Error("Parent node not found");
        parentPath = parent.path;
      }

      const path = computePath(parentPath, slug);

      const existing = await db.query.nodes.findFirst({
        where: and(eq(nodes.siteId, SITE_ID), eq(nodes.path, path)),
      });
      if (existing) throw new Error(`Path "${path}" already exists`);

      const id = generateId("node");
      const now = new Date();

      await db.insert(nodes).values({
        id,
        siteId: SITE_ID,
        contentTypeId: input.contentTypeId,
        parentId: input.parentId ?? null,
        locale: input.locale,
        slug,
        path,
        position: 0,
        status: "draft",
        title: input.title,
        fields: input.fields,
        seo: input.seo ?? {},
        createdBy: context.locals.user.id,
        createdVia: "web",
        createdAt: now,
        updatedAt: now,
      });

      return { id, path };
    },
  }),

  update: defineAction({
    input: z.object({
      id: z.string(),
      title: z.string().min(1).optional(),
      slug: z.string().optional(),
      fields: z.record(z.unknown()).optional(),
      seo: NodeSeoSchema.optional(),
      status: z.enum(["draft", "published", "scheduled"]).optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, SITE_ID)),
      });
      if (!node) throw new Error("Node not found");

      const updates: Partial<typeof node> = { updatedAt: new Date() };

      if (input.title) updates.title = input.title;
      if (input.fields) updates.fields = input.fields;
      if (input.seo) updates.seo = input.seo;
      if (input.status) updates.status = input.status;

      if (input.slug && input.slug !== node.slug) {
        const newSlug = slugify(input.slug);
        const parentPath = node.path.substring(0, node.path.lastIndexOf("/")) || null;
        const newPath = computePath(parentPath, newSlug);

        const existing = await db.query.nodes.findFirst({
          where: and(eq(nodes.siteId, SITE_ID), eq(nodes.path, newPath)),
        });
        if (existing && existing.id !== input.id) {
          throw new Error(`Path "${newPath}" already exists`);
        }

        updates.slug = newSlug;
        updates.path = newPath;
      }

      await db.update(nodes).set(updates).where(eq(nodes.id, input.id));
      return { id: input.id };
    },
  }),

  publish: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, SITE_ID)),
      });
      if (!node) throw new Error("Node not found");

      const now = new Date();
      await db
        .update(nodes)
        .set({ status: "published", publishedAt: now, updatedAt: now })
        .where(eq(nodes.id, input.id));

      return { id: input.id, publishedAt: now };
    },
  }),

  delete: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const db = context.locals.db;

      const children = await db.query.nodes.findMany({
        where: eq(nodes.parentId, input.id),
      });
      if (children.length > 0) {
        throw new Error("Cannot delete a node that has children");
      }

      await db
        .delete(nodes)
        .where(and(eq(nodes.id, input.id), eq(nodes.siteId, SITE_ID)));

      return { id: input.id };
    },
  }),
};
