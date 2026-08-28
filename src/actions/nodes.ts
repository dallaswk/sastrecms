import { badRequest, conflict, notFound, unauthorized } from "@lib/errors";
import { defineAction, ActionError } from "./_define";
import { z } from "astro:schema";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { nodes, contentTypes } from "@db/schema";
import { generateId, slugify, computePath, reservedSlugError } from "@lib/id";
import { requireAdmin, requirePermission, requireSiteRole, viewableContentTypeIds } from "@lib/permissions";
import { sanitizeFields } from "@lib/sanitize";
import { invalidateNode } from "@lib/cache-invalidate";
import { nodeRevisions } from "@db/schema";
import { checkConflict, checkSchedule } from "@lib/publishing";
import { isWorthSnapshotting, summariseChange, revisionsToPrune } from "@lib/revisions";
import { createPreviewToken, previewUrl, DEFAULT_PREVIEW_TTL_SECONDS } from "@lib/preview";

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
      if (!context.locals.user) throw unauthorized();
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
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)),
        with: { contentType: true },
      });

      if (!node) throw notFound("Esa página no existe.");
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
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;
      await requirePermission(db, context.locals.user.id, siteId, input.contentTypeId, "create");

      const ct = await db.query.contentTypes.findFirst({
        where: and(eq(contentTypes.id, input.contentTypeId), eq(contentTypes.siteId, siteId)),
      });
      if (!ct) throw notFound("Ese tipo de contenido no existe.");

      const slug = input.slug ?? slugify(input.title);

      const reserved = reservedSlugError(slug, Boolean(input.parentId));
      if (reserved) throw badRequest(reserved);

      let parentPath: string | null = null;

      if (input.parentId) {
        const parent = await db.query.nodes.findFirst({
          where: and(eq(nodes.id, input.parentId), eq(nodes.siteId, siteId)),
        });
        if (!parent) throw notFound("La página padre no existe.");
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
          throw conflict(
            `El slug «index» es la portada de este idioma (${path}), y ya existe. ` +
              "Usa otro slug, o edita la portada existente."
          );
        }
        throw conflict(`La ruta «${path}» ya existe.`);
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
      /**
       * The `updatedAt` the editor loaded.
       *
       * Optional so a script or an agent that does not care is not blocked, but the form always
       * sends it: without it this was last-writer-wins over the *whole* `fields` object, so two
       * people on the same page did not merge — the second save replaced every block the first
       * one had added.
       */
      expectedUpdatedAt: z.coerce.date().optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, siteId), isNull(nodes.deletedAt)),
      });
      if (!node) throw notFound("Esa página no existe.");
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "edit");

      // Writing `status` through update was a way around the publish permission that
      // nodes.publish enforces. Any status transition — including unpublishing — needs it.
      if (input.status && input.status !== node.status) {
        await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "publish");
      }

      // `precondition` y no `conflict`: el nombre corto tapaba el ayudante de errores importado
      // arriba, y el resultado era un `conflict(...)` más abajo que no compilaba.
      const precondition = checkConflict(node, input.expectedUpdatedAt);
      if (!precondition.ok) {
        throw conflict(precondition.reason);
      }

      /*
       * The snapshot goes in before the write, and only when something actually changed.
       *
       * Before, because the moment somebody wants the previous version is always after the
       * change that lost it. Only on a real change, because a save that alters nothing is
       * common — open a page, look at it, hit save — and twenty of those would push every
       * real revision out of a capped history.
       */
      const snapshot = {
        title: node.title,
        slug: node.slug,
        status: node.status,
        fields: node.fields as Record<string, unknown>,
        seo: node.seo,
      };
      const proposed = {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.slug !== undefined ? { slug: slugify(input.slug) } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.fields !== undefined ? { fields: input.fields } : {}),
        ...(input.seo !== undefined ? { seo: input.seo } : {}),
      };

      if (isWorthSnapshotting(snapshot, proposed)) {
        await db.insert(nodeRevisions).values({
          id: generateId("rev"),
          siteId,
          nodeId: node.id,
          ...snapshot,
          authorId: context.locals.user.id,
          authorVia: "web",
          summary: summariseChange(snapshot, proposed),
          createdAt: new Date(),
        });

        const existing = await db.query.nodeRevisions.findMany({
          where: and(eq(nodeRevisions.nodeId, node.id), eq(nodeRevisions.siteId, siteId)),
          columns: { id: true },
          orderBy: (r, { asc }) => [asc(r.createdAt)],
        });
        const stale = revisionsToPrune(existing.map((row) => row.id));
        if (stale.length) {
          await db
            .delete(nodeRevisions)
            .where(and(inArray(nodeRevisions.id, stale), eq(nodeRevisions.siteId, siteId)));
        }
      }

      const updates: Partial<typeof node> = { updatedAt: new Date() };

      if (input.title) updates.title = input.title;
      if (input.fields) updates.fields = sanitizeFields(input.fields);
      if (input.seo) updates.seo = input.seo;
      if (input.status) updates.status = input.status;

      if (input.slug && input.slug !== node.slug) {
        const newSlug = slugify(input.slug);

        const reserved = reservedSlugError(newSlug, Boolean(node.parentId));
        if (reserved) throw badRequest(reserved);

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
          throw conflict(`La ruta «${newPath}» ya existe.`);
        }

        updates.slug = newSlug;
        updates.path = newPath;
      }

      await db.update(nodes).set(updates).where(and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)));

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
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)),
      });
      if (!node) throw notFound("Esa página no existe.");
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "publish");

      const now = new Date();
      await db
        .update(nodes)
        .set({ status: "published", publishedAt: now, updatedAt: now })
        .where(and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)));

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

  /**
   * Deleting is now moving to the trash.
   *
   * `permanent` exists for emptying it, and is admin-only: a page is the client's work, and a
   * mis-click that used to be irreversible now costs a click to undo. The path is freed either
   * way — a trashed node keeps its own path, which would block re-creating a page at the same
   * URL, so the trash renames it out of the way.
   */
  delete: defineAction({
    input: z.object({ id: z.string(), permanent: z.boolean().optional() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      /*
       * El orden: encontrarla, comprobar que puedes tocarla, y sólo entonces las precondiciones.
       *
       * Estaba al revés, y el resultado era que un colaborador sin permiso de borrado recibía
       * «esa página tiene 2 hijas» —la estructura del sitio— antes de que nadie comprobase si
       * podía borrar nada. Una precondición contestada antes que el permiso es una respuesta a
       * quien no tenía derecho a preguntar.
       */
      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)),
      });
      if (!node) throw notFound("Esa página no existe.");
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "delete");

      const children = await db.query.nodes.findMany({
        where: and(eq(nodes.parentId, input.id), eq(nodes.siteId, siteId), isNull(nodes.deletedAt)),
      });
      if (children.length > 0) {
        // 409 y no 400: la petición está bien formada, es el estado actual el que lo impide.
        // Mismo caso que borrar una carpeta con archivos dentro.
        throw conflict(`Esa página tiene ${children.length} hija(s). Muévelas o bórralas primero.`);
      }

      if (input.permanent) {
        await requireAdmin(db, context.locals.user.id, siteId);
        await db
          .delete(nodeRevisions)
          .where(and(eq(nodeRevisions.nodeId, input.id), eq(nodeRevisions.siteId, siteId)));
        await db.delete(nodes).where(and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)));
      } else {
        const now = new Date();
        await db
          .update(nodes)
          .set({
            deletedAt: now,
            // The path carries a unique index with siteId, so a trashed node would block
            // creating a new page at the same URL. Suffixed rather than blanked so restoring
            // can put it back.
            path: `${node.path}#papelera-${now.getTime()}`,
            updatedAt: now,
          })
          .where(and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)));
      }

      await invalidateNode(context.cache, {
        siteId,
        nodeId: input.id,
        contentTypeId: node.contentTypeId,
        parentId: node.parentId,
      });

      return { id: input.id, permanent: !!input.permanent };
    },
  }),

  /** Puts a trashed node back, unless something has taken its path in the meantime. */
  restore: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)),
      });
      if (!node) throw notFound("Esa página no existe.");
      if (!node.deletedAt) return { id: node.id, path: node.path, alreadyActive: true };

      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "edit");

      const originalPath = node.path.split("#papelera-")[0]!;
      const clash = await db.query.nodes.findFirst({
        where: and(eq(nodes.siteId, siteId), eq(nodes.path, originalPath), isNull(nodes.deletedAt)),
      });
      if (clash) {
        throw new ActionError({
          code: "CONFLICT",
          message: `Ya hay otra página en "${originalPath}" («${clash.title}»). Cámbiale el slug a una de las dos antes de restaurar.`,
        });
      }

      // Restored as a draft, never straight back to published: whatever the reason it was
      // deleted, putting it live again without anyone looking is the wrong default.
      await db
        .update(nodes)
        .set({ deletedAt: null, path: originalPath, status: "draft", updatedAt: new Date() })
        .where(and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)));

      await invalidateNode(context.cache, {
        siteId,
        nodeId: input.id,
        contentTypeId: node.contentTypeId,
        parentId: node.parentId,
      });

      return { id: node.id, path: originalPath, status: "draft" };
    },
  }),

  /**
   * Scheduled publishing, with no cron.
   *
   * Sets the status and the moment; the public query accepts `scheduled AND publish_at <= now`,
   * so the page appears on the first request after that instant. Nothing has to run.
   */
  schedule: defineAction({
    input: z.object({ id: z.string(), publishAt: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.id), eq(nodes.siteId, siteId), isNull(nodes.deletedAt)),
      });
      if (!node) throw notFound("Esa página no existe.");
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "publish");

      const check = checkSchedule(input.publishAt, new Date());
      if (!check.ok) throw new ActionError({ code: "BAD_REQUEST", message: check.reason });

      await db
        .update(nodes)
        .set({ status: "scheduled", publishAt: check.publishAt, updatedAt: new Date() })
        .where(and(eq(nodes.id, input.id), eq(nodes.siteId, siteId)));

      await invalidateNode(context.cache, {
        siteId,
        nodeId: input.id,
        contentTypeId: node.contentTypeId,
        parentId: node.parentId,
      });

      return { id: node.id, publishAt: check.publishAt };
    },
  }),

  /** The history of one page, newest first. Summaries only: the snapshots are pages of JSON. */
  revisions: defineAction({
    input: z.object({ nodeId: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.nodeId), eq(nodes.siteId, siteId)),
      });
      if (!node) throw notFound("Esa página no existe.");
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "view");

      const rows = await db.query.nodeRevisions.findMany({
        where: and(eq(nodeRevisions.nodeId, input.nodeId), eq(nodeRevisions.siteId, siteId)),
        columns: { id: true, title: true, status: true, summary: true, authorVia: true, createdAt: true },
        orderBy: [desc(nodeRevisions.createdAt)],
      });

      return rows;
    },
  }),

  /**
   * Puts a revision back.
   *
   * Restoring is itself an edit, so it goes through the same snapshot path — otherwise going
   * back one version and then changing your mind would have nothing to go forward to.
   */
  restoreRevision: defineAction({
    input: z.object({ revisionId: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const revision = await db.query.nodeRevisions.findFirst({
        where: and(eq(nodeRevisions.id, input.revisionId), eq(nodeRevisions.siteId, siteId)),
      });
      if (!revision) throw notFound("Esa revisión no existe.");

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, revision.nodeId), eq(nodes.siteId, siteId), isNull(nodes.deletedAt)),
      });
      if (!node) throw notFound("Esa página no existe.");
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "edit");

      const snapshot = {
        title: node.title,
        slug: node.slug,
        status: node.status,
        fields: node.fields as Record<string, unknown>,
        seo: node.seo,
      };

      await db.insert(nodeRevisions).values({
        id: generateId("rev"),
        siteId,
        nodeId: node.id,
        ...snapshot,
        authorId: context.locals.user.id,
        authorVia: "web",
        summary: `antes de restaurar la versión del ${revision.createdAt.toLocaleString("es-ES")}`,
        createdAt: new Date(),
      });

      /*
       * The slug and the path are deliberately *not* restored.
       *
       * A URL that has been live is linked to from elsewhere, and silently moving the page back
       * to a previous address breaks those links without anybody deciding to. The content comes
       * back; the address stays where it is.
       */
      await db
        .update(nodes)
        .set({
          title: revision.title,
          fields: sanitizeFields(revision.fields as Record<string, unknown>),
          seo: revision.seo,
          updatedAt: new Date(),
        })
        .where(and(eq(nodes.id, node.id), eq(nodes.siteId, siteId)));

      await invalidateNode(context.cache, {
        siteId,
        nodeId: node.id,
        contentTypeId: node.contentTypeId,
        parentId: node.parentId,
      });

      return { nodeId: node.id, restoredFrom: revision.createdAt, keptPath: node.path };
    },
  }),

  /** What is in the trash. */
  trash: defineAction({
    handler: async (_input, context) => {
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;
      await requireSiteRole(db, context.locals.user.id, siteId);

      const rows = await db.query.nodes.findMany({
        where: and(eq(nodes.siteId, siteId), isNotNull(nodes.deletedAt)),
        columns: { id: true, title: true, path: true, deletedAt: true, contentTypeId: true },
        orderBy: [desc(nodes.deletedAt)],
      });

      const viewable = await viewableContentTypeIds(db, context.locals.user.id, siteId);
      return rows
        .filter((row) => viewable.has(row.contentTypeId))
        .map((row) => ({ ...row, path: row.path.split("#papelera-")[0]! }));
    },
  }),

  /**
   * A shareable link to a draft.
   *
   * Signed and stateless: nothing is stored, so nothing has to be cleaned up, and rotating the
   * app secret revokes every link at once.
   */
  previewLink: defineAction({
    input: z.object({ nodeId: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.nodeId), eq(nodes.siteId, siteId), isNull(nodes.deletedAt)),
      });
      if (!node) throw notFound("Esa página no existe.");
      await requirePermission(db, context.locals.user.id, siteId, node.contentTypeId, "view");

      const secret = context.locals.env?.BETTER_AUTH_SECRET;
      if (!secret) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No hay secreto configurado, así que no se puede firmar el enlace.",
        });
      }

      const now = new Date();
      const token = await createPreviewToken(node.id, secret, now);
      const path = node.path.split("#papelera-")[0]!;

      return {
        url: previewUrl(new URL(context.request.url).origin, path, token),
        expiresAt: new Date(now.getTime() + DEFAULT_PREVIEW_TTL_SECONDS * 1000),
      };
    },
  }),

  linkTranslation: defineAction({
    input: z.object({
      nodeId: z.string(),
      targetId: z.string(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      if (input.nodeId === input.targetId) throw badRequest("Un nodo no puede vincularse consigo mismo.");

      const [nodeA, nodeB] = await Promise.all([
        db.query.nodes.findFirst({ where: and(eq(nodes.id, input.nodeId), eq(nodes.siteId, siteId)) }),
        db.query.nodes.findFirst({ where: and(eq(nodes.id, input.targetId), eq(nodes.siteId, siteId)) }),
      ]);
      if (!nodeA || !nodeB) throw notFound("Esa página no existe.");

      if (nodeA.locale === nodeB.locale) throw badRequest("Ambos nodos tienen el mismo idioma.");

      const groupId = nodeA.translationGroupId ?? nodeB.translationGroupId ?? generateId("tg");

      await Promise.all([
        db
          .update(nodes)
          .set({ translationGroupId: groupId })
          .where(and(eq(nodes.id, nodeA.id), eq(nodes.siteId, siteId))),
        db
          .update(nodes)
          .set({ translationGroupId: groupId })
          .where(and(eq(nodes.id, nodeB.id), eq(nodes.siteId, siteId))),
      ]);

      return { groupId };
    },
  }),

  unlinkTranslation: defineAction({
    input: z.object({ nodeId: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      const db = context.locals.db;

      const node = await db.query.nodes.findFirst({
        where: and(eq(nodes.id, input.nodeId), eq(nodes.siteId, siteId)),
      });
      if (!node) throw notFound("Esa página no existe.");

      if (!node.translationGroupId) return { ok: true };

      const siblings = await db.query.nodes.findMany({
        where: and(
          eq(nodes.translationGroupId, node.translationGroupId),
          eq(nodes.siteId, siteId),
          isNotNull(nodes.locale)
        ),
      });

      await db
          .update(nodes)
          .set({ translationGroupId: null })
          .where(and(eq(nodes.id, node.id), eq(nodes.siteId, siteId)));

      if (siblings.filter((s) => s.id !== node.id).length === 1) {
        await db
          .update(nodes)
          .set({ translationGroupId: null })
          .where(
            and(
              eq(nodes.translationGroupId, node.translationGroupId),
              eq(nodes.siteId, siteId)
            )
          );
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
      if (!context.locals.user) throw unauthorized();
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
        if (target === item.id) throw badRequest("Un nodo no puede ser su propio padre.");
        if (isDescendant(target, item.id)) {
          const node = nodeById[item.id];
          throw badRequest(
            `No se puede mover «${node?.title ?? item.id}» dentro de su propio contenido.`
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
        if (existing) throw conflict(`La ruta «${newPath}» ya existe.`);
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
      if (!context.locals.user) throw unauthorized();
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
