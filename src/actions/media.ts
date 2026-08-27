import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, and, isNull, or, like } from "drizzle-orm";
import { media, mediaFolders, nodes, settings } from "@db/schema";
import { generateId } from "@lib/id";
import { requireSiteRole } from "@lib/permissions";
import { findUrlInValue, describeUsage, type UsageLocation } from "@lib/media-usage";
import type { Database } from "@db/client";

const ACCEPTED_TYPES: Record<string, "image" | "video" | "pdf" | "doc"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/svg+xml": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
};

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB


export type MediaUsageEntry = {
  nodeId: string;
  title: string;
  path: string;
  status: string;
  locale: string;
  locations: UsageLocation[];
};

/**
 * Every place this file is referenced. Content fields store the URL rather than the
 * media id, so this reads the JSON instead of following a foreign key.
 *
 * The candidate query is a LIKE over the serialised JSON to avoid loading every node;
 * each candidate is then parsed and matched exactly, so a URL that merely shares a
 * prefix with another does not produce a false warning.
 */
async function findMediaUsage(
  db: Database,
  siteId: string,
  url: string
): Promise<{ nodes: MediaUsageEntry[]; settings: string[] }> {
  const candidates = await db.query.nodes.findMany({
    where: and(
      eq(nodes.siteId, siteId),
      or(like(nodes.fields, `%${url}%`), like(nodes.seo, `%${url}%`))
    ),
    columns: { id: true, title: true, path: true, status: true, locale: true, fields: true, seo: true },
  });

  const used: MediaUsageEntry[] = [];
  for (const node of candidates) {
    const locations = [
      ...findUrlInValue(node.fields, url),
      ...findUrlInValue(node.seo, url).map((l) => ({ ...l, field: `SEO · ${l.field}` })),
    ];
    if (locations.length > 0) {
      used.push({
        nodeId: node.id,
        title: node.title,
        path: node.path,
        status: node.status,
        locale: node.locale,
        locations,
      });
    }
  }

  const siteSettings = await db.query.settings.findFirst({
    where: eq(settings.siteId, siteId),
    columns: { logoUrl: true, faviconUrl: true },
  });
  const inSettings: string[] = [];
  if (siteSettings?.logoUrl === url) inSettings.push("Logo del sitio");
  if (siteSettings?.faviconUrl === url) inSettings.push("Favicon");

  return { nodes: used, settings: inSettings };
}

export const mediaActions = {
  list: defineAction({
    input: z.object({
      folderId: z.string().nullable().optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      const conditions = [eq(media.siteId, siteId)];
      if (input.folderId !== undefined) {
        if (input.folderId === null) {
          conditions.push(isNull(media.folderId));
        } else {
          conditions.push(eq(media.folderId, input.folderId));
        }
      }

      const [files, folders] = await Promise.all([
        db.query.media.findMany({
          where: and(...conditions),
          orderBy: (m, { desc }) => [desc(m.createdAt)],
        }),
        db.query.mediaFolders.findMany({
          where: and(
            eq(mediaFolders.siteId, siteId),
            input.folderId
              ? eq(mediaFolders.parentId, input.folderId)
              : isNull(mediaFolders.parentId)
          ),
          orderBy: (f, { asc }) => [asc(f.name)],
        }),
      ]);

      return { files, folders };
    },
  }),

  upload: defineAction({
    accept: "form",
    input: z.object({
      file: z.instanceof(File),
      folderId: z.string().optional(),
      altText: z.string().optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      const { file } = input;

      if (file.size > MAX_SIZE_BYTES) {
        throw new Error(`File too large. Maximum size is ${MAX_SIZE_BYTES / 1024 / 1024} MB`);
      }

      const mediaType = ACCEPTED_TYPES[file.type];
      if (!mediaType) {
        throw new Error(`File type "${file.type}" is not accepted`);
      }

      // Resolved by the middleware. Reading locals.runtime.env here used to throw on
      // Workers — the adapter replaced it with a getter that raises — and the optional
      // chaining hid it, so uploads failed only in production.
      const r2 = context.locals.r2;
      if (!r2) throw new Error("R2 bucket not configured");

      // The public host is per-deployment (a custom domain or the r2.dev URL), so it
      // comes from the environment. It used to be hardcoded to a workers.dev host that
      // does not exist, which left every uploaded file with a broken URL.
      const publicBase = context.locals.env?.R2_PUBLIC_URL;
      if (!publicBase) {
        throw new Error(
          "R2_PUBLIC_URL no está configurado: sin él los archivos subidos quedarían con una URL inválida"
        );
      }

      const ext = file.name.split(".").pop() ?? "bin";

      // One id for both the row and the storage key, so a file in the bucket can always
      // be traced back to its media record.
      const id = generateId("media");
      const storageKey = `${siteId}/${id}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();
      await r2.put(storageKey, arrayBuffer, {
        httpMetadata: { contentType: file.type },
      });

      const url = `${publicBase.replace(/\/+$/, "")}/${storageKey}`;

      await db.insert(media).values({
        id,
        siteId,
        type: mediaType,
        storageKey,
        url,
        altText: input.altText,
        sizeBytes: file.size,
        folderId: input.folderId ?? null,
        uploadedBy: context.locals.user.id,
        createdAt: new Date(),
      });

      return { id, url, storageKey };
    },
  }),

  /** What references this file. The UI calls it before offering to delete. */
  usage: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      const file = await db.query.media.findFirst({
        where: and(eq(media.id, input.id), eq(media.siteId, siteId)),
      });
      if (!file) throw new Error("Media not found");

      const usage = await findMediaUsage(db, siteId, file.url);
      const published = usage.nodes.filter((n) => n.status === "published").length;

      return {
        url: file.url,
        nodes: usage.nodes,
        settings: usage.settings,
        summary: describeUsage(usage.nodes.length, published, usage.settings.length),
      };
    },
  }),

  delete: defineAction({
    input: z.object({
      id: z.string(),
      /** Set once the user has seen the list of references and chosen to continue. */
      force: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      const file = await db.query.media.findFirst({
        where: and(eq(media.id, input.id), eq(media.siteId, siteId)),
      });
      if (!file) throw new Error("Media not found");

      // Deleting is irreversible — the R2 object and the row both go, with no trash —
      // and the reference lives in the node's JSON, so nothing would break loudly: the
      // page keeps serving a 200 with an image that no longer resolves. Refuse until
      // whoever is deleting has seen where it is used.
      if (!input.force) {
        const usage = await findMediaUsage(db, siteId, file.url);
        const total = usage.nodes.length + usage.settings.length;
        if (total > 0) {
          const where = [
            ...usage.nodes.map((n) => `${n.title} (${n.path})`),
            ...usage.settings,
          ];
          const shown = where.slice(0, 5).join(", ");
          const rest = where.length > 5 ? ` y ${where.length - 5} más` : "";
          throw new Error(
            `Este archivo está enlazado en: ${shown}${rest}. ` +
              "Bórralo desde ahí primero, o confirma que quieres borrarlo igualmente."
          );
        }
      }

      const r2 = context.locals.r2;
      if (r2) {
        await r2.delete(file.storageKey);
      }

      await db.delete(media).where(eq(media.id, input.id));
      return { id: input.id };
    },
  }),

  createFolder: defineAction({
    input: z.object({
      name: z.string().min(1),
      parentId: z.string().nullable().optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      const id = generateId("folder");
      await db.insert(mediaFolders).values({
        id,
        siteId,
        name: input.name,
        parentId: input.parentId ?? null,
        createdAt: new Date(),
      });
      return { id };
    },
  }),

  deleteFolder: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      const hasFiles = await db.query.media.findFirst({
        where: and(eq(media.folderId, input.id), eq(media.siteId, siteId)),
      });
      if (hasFiles) throw new Error("Cannot delete a folder that contains files");

      const hasSubfolders = await db.query.mediaFolders.findFirst({
        where: and(eq(mediaFolders.parentId, input.id), eq(mediaFolders.siteId, siteId)),
      });
      if (hasSubfolders) throw new Error("Cannot delete a folder that contains subfolders");

      await db.delete(mediaFolders).where(eq(mediaFolders.id, input.id));
      return { id: input.id };
    },
  }),
};
