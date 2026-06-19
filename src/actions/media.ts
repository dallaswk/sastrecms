import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, and, isNull } from "drizzle-orm";
import { media, mediaFolders } from "@db/schema";
import { generateId } from "@lib/id";

const SITE_ID = "site_default";

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

export const mediaActions = {
  list: defineAction({
    input: z.object({
      folderId: z.string().nullable().optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const db = context.locals.db;

      const conditions = [eq(media.siteId, SITE_ID)];
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
            eq(mediaFolders.siteId, SITE_ID),
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
      const db = context.locals.db;

      const { file } = input;

      if (file.size > MAX_SIZE_BYTES) {
        throw new Error(`File too large. Maximum size is ${MAX_SIZE_BYTES / 1024 / 1024} MB`);
      }

      const mediaType = ACCEPTED_TYPES[file.type];
      if (!mediaType) {
        throw new Error(`File type "${file.type}" is not accepted`);
      }

      const r2 = context.locals.runtime?.env?.R2_BUCKET as R2Bucket | undefined;
      if (!r2) throw new Error("R2 bucket not configured");

      const ext = file.name.split(".").pop() ?? "bin";
      const storageKey = `${SITE_ID}/${generateId("media")}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();
      await r2.put(storageKey, arrayBuffer, {
        httpMetadata: { contentType: file.type },
      });

      const url = `https://media.${SITE_ID}.workers.dev/${storageKey}`;

      const id = generateId("media");
      await db.insert(media).values({
        id,
        siteId: SITE_ID,
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

  delete: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw new Error("Unauthorized");
      const db = context.locals.db;

      const file = await db.query.media.findFirst({
        where: and(eq(media.id, input.id), eq(media.siteId, SITE_ID)),
      });
      if (!file) throw new Error("Media not found");

      const r2 = context.locals.runtime?.env?.R2_BUCKET as R2Bucket | undefined;
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
      const db = context.locals.db;

      const id = generateId("folder");
      await db.insert(mediaFolders).values({
        id,
        siteId: SITE_ID,
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
      const db = context.locals.db;

      const hasFiles = await db.query.media.findFirst({
        where: and(eq(media.folderId, input.id), eq(media.siteId, SITE_ID)),
      });
      if (hasFiles) throw new Error("Cannot delete a folder that contains files");

      const hasSubfolders = await db.query.mediaFolders.findFirst({
        where: and(eq(mediaFolders.parentId, input.id), eq(mediaFolders.siteId, SITE_ID)),
      });
      if (hasSubfolders) throw new Error("Cannot delete a folder that contains subfolders");

      await db.delete(mediaFolders).where(eq(mediaFolders.id, input.id));
      return { id: input.id };
    },
  }),
};
