import { badRequest, conflict, notFound, unauthorized } from "@lib/errors";
import { defineAction } from "./_define";
import { z } from "astro:schema";
import { eq, and, isNull, or, like } from "drizzle-orm";
import { media, mediaFolders, nodes, settings } from "@db/schema";
import { generateId } from "@lib/id";
import { requireSiteRole } from "@lib/permissions";
import { findUrlInValue, describeUsage, type UsageLocation } from "@lib/media-usage";
import type { Database } from "@db/client";
import { imageMetadata } from "astro/assets/utils";

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
      if (!context.locals.user) throw unauthorized();
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
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      const { file } = input;

      if (file.size > MAX_SIZE_BYTES) {
        throw badRequest(`El archivo es demasiado grande. El máximo son ${MAX_SIZE_BYTES / 1024 / 1024} MB.`);
      }

      const mediaType = ACCEPTED_TYPES[file.type];
      if (!mediaType) {
        throw badRequest(`El tipo de archivo «${file.type}» no se acepta.`);
      }

      /*
       * Dónde se guarda. Lo resuelve el middleware: R2 si hay binding, disco si no.
       *
       * Antes esto leía el binding a pelo y lanzaba «R2 bucket not configured» — un 500 sin
       * explicación que en `astro dev` salía *siempre*, porque el adaptador de Node no tiene
       * bindings. El efecto era que no se podía montar un sitio en local: lo primero que pide
       * cualquiera es subir su logo.
       */
      const store = context.locals.mediaStore;
      if (!store) {
        throw badRequest(
          context.locals.mediaStoreReason ?? "No hay dónde guardar el archivo."
        );
      }

      const ext = file.name.split(".").pop() ?? "bin";

      // One id for both the row and the storage key, so a file in the bucket can always
      // be traced back to its media record.
      const id = generateId("media");
      const storageKey = `${siteId}/${id}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();

      /*
       * Dimensions read from the bytes, before the upload.
       *
       * `imageMetadata` is pure JS from Astro's own asset utilities — it parses the header,
       * so it runs on Workers, unlike sharp, which this project cannot use at all. Storing
       * width and height is what lets a page reserve the right space for an image and get a
       * CLS of zero; without them every image on the site shifts the layout as it loads.
       *
       * It also reports EXIF orientation, which is why a photo straight off a phone is not
       * silently rendered sideways.
       */
      let dimensions: { width: number; height: number } | null = null;
      if (mediaType === "image" && file.type !== "image/svg+xml") {
        try {
          const meta = await imageMetadata(new Uint8Array(arrayBuffer));
          if (meta?.width && meta?.height) {
            // 5, 6, 7 and 8 mean the image is stored rotated a quarter turn, so the stored
            // width and height are the other way round from how it displays.
            const rotated = typeof meta.orientation === "number" && meta.orientation >= 5;
            dimensions = rotated
              ? { width: meta.height, height: meta.width }
              : { width: meta.width, height: meta.height };
          }
        } catch {
          // An unreadable header is not a reason to refuse the upload: the file may still be
          // perfectly usable, it just renders without a reserved box.
        }
      }

      await store.put(storageKey, arrayBuffer, file.type);

      const url = store.urlFor(storageKey);

      await db.insert(media).values({
        id,
        siteId,
        type: mediaType,
        storageKey,
        url,
        altText: input.altText,
        ...(dimensions ?? {}),
        sizeBytes: file.size,
        folderId: input.folderId ?? null,
        uploadedBy: context.locals.user.id,
        createdAt: new Date(),
      });

      return { id, url, storageKey, ...(dimensions ?? {}) };
    },
  }),

  /** What references this file. The UI calls it before offering to delete. */
  usage: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      const file = await db.query.media.findFirst({
        where: and(eq(media.id, input.id), eq(media.siteId, siteId)),
      });
      if (!file) throw notFound("Ese archivo no existe.");

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
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      const file = await db.query.media.findFirst({
        where: and(eq(media.id, input.id), eq(media.siteId, siteId)),
      });
      if (!file) throw notFound("Ese archivo no existe.");

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
          throw conflict(
            `Este archivo está enlazado en: ${shown}${rest}. ` +
              "Bórralo desde ahí primero, o confirma que quieres borrarlo igualmente."
          );
        }
      }

      // Si no hay almacén, la fila se borra igual: dejarla apuntando a un archivo que nadie
      // puede quitar es peor que quedarse un huérfano en el disco.
      await context.locals.mediaStore?.remove(file.storageKey);

      await db.delete(media).where(and(eq(media.id, input.id), eq(media.siteId, siteId)));
      return { id: input.id };
    },
  }),

  createFolder: defineAction({
    input: z.object({
      name: z.string().min(1),
      parentId: z.string().nullable().optional(),
    }),
    handler: async (input, context) => {
      if (!context.locals.user) throw unauthorized();
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
      if (!context.locals.user) throw unauthorized();
      const siteId = context.locals.siteId;
      await requireSiteRole(context.locals.db, context.locals.user.id, siteId);
      const db = context.locals.db;

      // Comprobar que existe, y que existe *aquí*.
      //
      // Sin esto, borrar una carpeta inexistente —o la de otro inquilino— respondía 200 con
      // `{id}`: el borrado no afectaba a ninguna fila y la respuesta decía que había ido bien.
      // Un éxito silencioso es peor que un error, porque nadie va a comprobarlo.
      const folder = await db.query.mediaFolders.findFirst({
        where: and(eq(mediaFolders.id, input.id), eq(mediaFolders.siteId, siteId)),
      });
      if (!folder) throw notFound("Esa carpeta no existe.");

      const hasFiles = await db.query.media.findFirst({
        where: and(eq(media.folderId, input.id), eq(media.siteId, siteId)),
      });
      if (hasFiles) throw conflict("No se puede borrar una carpeta que contiene archivos.");

      const hasSubfolders = await db.query.mediaFolders.findFirst({
        where: and(eq(mediaFolders.parentId, input.id), eq(mediaFolders.siteId, siteId)),
      });
      if (hasSubfolders) throw conflict("No se puede borrar una carpeta que contiene otras carpetas.");

      await db
        .delete(mediaFolders)
        .where(and(eq(mediaFolders.id, input.id), eq(mediaFolders.siteId, siteId)));
      return { id: input.id };
    },
  }),
};
