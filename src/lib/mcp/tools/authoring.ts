import { and, eq } from "drizzle-orm";
import { nodes, contentTypes, media } from "@db/schema";
import { generateId, slugify, computePath, reservedSlugError } from "@lib/id";
import { requirePermission, requireSiteRole } from "@lib/permissions";
import { parseSections } from "@lib/sections/validate";
import { materialiseSection } from "../coerce";
import { sanitizeFields } from "@lib/sanitize";
import { invalidateNode } from "@lib/cache-invalidate";
import { ToolError, objectSchema, S, type ToolDefinition } from "../types";
import type { SectionInstance } from "@lib/sections/types";

const ACCEPTED = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg",
  "image/gif": "gif", "application/pdf": "pdf",
} as const;

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const authoringTools: ToolDefinition[] = [
  {
    name: "create_page_from_sections",
    description:
      "Crea una página completa a partir de una lista de bloques, en una sola llamada. " +
      "Es lo que hace viable montar una landing sin encadenar diez llamadas. Nace como borrador.",
    mutates: true,
    inputSchema: objectSchema(
      {
        title: S.string("Título de la página"),
        slug: S.string("Slug. Vacío se deriva del título."),
        contentTypeKey: S.string("Clave del tipo. Por defecto «page»."),
        parentPath: S.string("Ruta del padre, para anidar, p. ej. «/servicios»"),
        sections: S.array("Bloques: {type, data}. Mira describe_sections."),
        seo: S.object("metaTitle, metaDescription"),
        publish: S.boolean("Publicarla al crearla. Requiere permiso de publicación."),
      },
      ["title", "sections"]
    ),
    handler: async (params, context) => {
      const title = String(params.title ?? "").trim();
      if (!title) throw new ToolError("Hace falta «title»");
      if (!Array.isArray(params.sections)) throw new ToolError("«sections» tiene que ser una lista");

      const typeKey = String(params.contentTypeKey ?? "page");
      const type = await context.db.query.contentTypes.findFirst({
        where: and(eq(contentTypes.siteId, context.siteId), eq(contentTypes.key, typeKey)),
      });
      if (!type) throw new ToolError(`No existe el tipo "${typeKey}"`, "notFound");

      const sectionsField = (type.fieldSchema ?? []).find((field) => field.type === "sections");
      if (!sectionsField) {
        throw new ToolError(
          `El tipo "${typeKey}" no tiene constructor de secciones, así que no se puede componer con bloques.`,
          "invalidParams"
        );
      }

      await requirePermission(context.db, context.userId, context.siteId, type.id, "create");
      // Checked before anything is written: creating the page and then refusing to publish it
      // would leave a draft the agent believes is live.
      if (params.publish === true) {
        await requirePermission(context.db, context.userId, context.siteId, type.id, "publish");
      }

      // ---- the blocks, validated before the page exists
      const built: SectionInstance[] = params.sections.map(materialiseSection);

      const parsed = parseSections(built);
      if (parsed.errors.length > 0) {
        throw new ToolError("Alguna sección no es válida; no se ha creado nada.", "invalidParams", {
          errors: parsed.errors,
        });
      }

      // ---- the path
      const slug = slugify(String(params.slug ?? title));
      const parentPath = params.parentPath ? String(params.parentPath) : "";
      let parentId: string | null = null;
      let resolvedParentPath: string | null = null;

      if (parentPath) {
        const parent = await context.db.query.nodes.findFirst({
          where: and(eq(nodes.siteId, context.siteId), eq(nodes.path, parentPath)),
        });
        if (!parent) throw new ToolError(`No existe una página en "${parentPath}"`, "notFound");
        parentId = parent.id;
        resolvedParentPath = parent.path;
      }

      const reserved = reservedSlugError(slug, Boolean(parentId));
      if (reserved) throw new ToolError(reserved);

      const path = computePath(resolvedParentPath, slug, context.defaultLocale, context.defaultLocale);
      const clash = await context.db.query.nodes.findFirst({
        where: and(eq(nodes.siteId, context.siteId), eq(nodes.path, path)),
      });
      if (clash) {
        throw new ToolError(
          `Ya existe una página en "${path}" ("${clash.title}"). Usa otro slug, o edítala con set_sections.`,
          "conflict"
        );
      }

      const id = generateId("node");
      const now = new Date();
      const publish = params.publish === true;

      await context.db.insert(nodes).values({
        id,
        siteId: context.siteId,
        contentTypeId: type.id,
        parentId,
        locale: context.defaultLocale,
        slug,
        path,
        position: 0,
        status: publish ? "published" : "draft",
        publishedAt: publish ? now : null,
        title,
        fields: sanitizeFields({ [sectionsField.key]: parsed.sections }),
        seo: (params.seo ?? {}) as Record<string, unknown>,
        createdBy: context.userId,
        createdVia: "mcp",
        createdAt: now,
        updatedAt: now,
      });

      await invalidateNode(context.cache, {
        siteId: context.siteId,
        nodeId: id,
        contentTypeId: type.id,
        parentId,
      });

      return {
        id,
        path,
        status: publish ? "published" : "draft",
        sections: parsed.sections.map((section, index) => ({
          index,
          id: section.id,
          type: section.type,
        })),
      };
    },
  },

  {
    name: "upload_media",
    description:
      "Sube un archivo a la biblioteca desde su contenido en base64 y devuelve su URL, que es " +
      "lo que se pone en un campo de imagen. Pon siempre altText: sin él la imagen queda sin " +
      "etiquetar para un lector de pantalla.",
    mutates: true,
    inputSchema: objectSchema(
      {
        filename: S.string("Nombre del archivo, con extensión"),
        contentType: S.enum("Tipo MIME", Object.keys(ACCEPTED)),
        base64: S.string("Contenido del archivo en base64, sin el prefijo data:"),
        altText: S.string("Qué se ve en la imagen. Obligatorio en la práctica."),
      },
      ["filename", "contentType", "base64"]
    ),
    handler: async (params, context) => {
      await requireSiteRole(context.db, context.userId, context.siteId);

      const contentType = String(params.contentType ?? "");
      const ext = ACCEPTED[contentType as keyof typeof ACCEPTED];
      if (!ext) {
        throw new ToolError(
          `Tipo "${contentType}" no admitido. Admite: ${Object.keys(ACCEPTED).join(", ")}.`
        );
      }

      if (!context.r2) {
        throw new ToolError(
          "El almacenamiento de archivos no está configurado en este entorno.",
          "conflict"
        );
      }

      const publicBase = context.env.R2_PUBLIC_URL;
      if (typeof publicBase !== "string" || !publicBase) {
        throw new ToolError("R2_PUBLIC_URL no está configurado.", "conflict");
      }

      let bytes: Uint8Array;
      try {
        // The data: prefix is stripped rather than rejected: a model that has seen one data
        // URI will send one, and refusing it teaches nothing useful.
        const raw = String(params.base64 ?? "").replace(/^data:[^;]+;base64,/, "");
        const binary = atob(raw);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } catch {
        throw new ToolError("«base64» no es base64 válido");
      }

      if (bytes.byteLength === 0) throw new ToolError("El archivo está vacío");
      if (bytes.byteLength > MAX_UPLOAD_BYTES) {
        throw new ToolError(
          `El archivo pesa ${Math.round(bytes.byteLength / 1024)} KB y el máximo es ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
        );
      }

      const id = generateId("media");
      const storageKey = `${context.siteId}/${id}.${ext}`;
      await context.r2.put(storageKey, bytes, { httpMetadata: { contentType } });

      // Dimensions read from the bytes, same as the web upload — otherwise an agent-uploaded
      // image is the one that shifts the layout.
      let dimensions: { width: number; height: number } | null = null;
      if (contentType.startsWith("image/") && contentType !== "image/svg+xml") {
        try {
          const { imageMetadata } = await import("astro/assets/utils");
          const meta = await imageMetadata(bytes);
          if (meta?.width && meta?.height) {
            const rotated = typeof meta.orientation === "number" && meta.orientation >= 5;
            dimensions = rotated
              ? { width: meta.height, height: meta.width }
              : { width: meta.width, height: meta.height };
          }
        } catch {
          // Unreadable header: stored without dimensions rather than refused.
        }
      }

      const url = `${publicBase.replace(/\/+$/, "")}/${storageKey}`;
      const altText = String(params.altText ?? "").trim();

      await context.db.insert(media).values({
        id,
        siteId: context.siteId,
        type: contentType === "application/pdf" ? "pdf" : "image",
        storageKey,
        url,
        altText: altText || null,
        ...(dimensions ?? {}),
        sizeBytes: bytes.byteLength,
        uploadedBy: context.userId,
        createdAt: new Date(),
      });

      return {
        id,
        url,
        ...(dimensions ?? {}),
        ...(altText ? {} : { warning: "Sin texto alternativo: la imagen queda sin etiquetar." }),
      };
    },
  },
];
