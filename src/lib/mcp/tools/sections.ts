import { and, eq } from "drizzle-orm";
import { nodes, contentTypes } from "@db/schema";
import { generateId } from "@lib/id";
import { requirePermission } from "@lib/permissions";
import { parseSections } from "@lib/sections/validate";
import { getSection } from "@lib/sections/registry";
import { sanitizeFields } from "@lib/sanitize";
import { invalidateNode } from "@lib/cache-invalidate";
import { moveItem } from "@components/admin/fields/itemList";
import { describeAllSections, describeOneSection } from "../section-schema";
import { materialiseSection } from "../coerce";
import { loadSections, requireSection } from "../node-sections";
import { ToolError, objectSchema, S, type ToolDefinition } from "../types";
import type { SectionInstance } from "@lib/sections/types";

/**
 * Authoring tools.
 *
 * The point of these, over `update_node`, is that a change to one block is one call. Asking a
 * model to shorten a hero headline by resending the whole page's `fields` means it has to
 * reproduce every other block correctly, and any mistake silently rewrites content nobody
 * asked it to touch. The persisted section ids are what make a single-block edit addressable —
 * and idempotent, so a retried call is safe.
 */

/** Validates and persists a new list, returning what was stored. */
async function writeSections(
  context: Parameters<ToolDefinition["handler"]>[1],
  loaded: Awaited<ReturnType<typeof loadSections>>,
  next: SectionInstance[]
) {
  await requirePermission(context.db, context.userId, context.siteId, loaded.node.contentTypeId, "edit");

  // Round-tripped through the same validator the editor and the renderer use, so an agent
  // cannot store a block that the page would then refuse to draw.
  const parsed = parseSections(next);
  if (parsed.errors.length > 0) {
    throw new ToolError(
      "Alguna sección no es válida y no se ha guardado nada.",
      "invalidParams",
      { errors: parsed.errors }
    );
  }

  const fields = {
    ...((loaded.node.fields ?? {}) as Record<string, unknown>),
    [loaded.key]: parsed.sections,
  };

  await context.db
    .update(nodes)
    .set({ fields: sanitizeFields(fields), updatedAt: new Date() })
    .where(and(eq(nodes.id, loaded.node.id), eq(nodes.siteId, context.siteId)));

  await invalidateNode(context.cache, {
    siteId: context.siteId,
    nodeId: loaded.node.id,
    contentTypeId: loaded.node.contentTypeId,
    parentId: loaded.node.parentId,
  });

  return {
    nodeId: loaded.node.id,
    path: loaded.node.path,
    sections: parsed.sections.map((section, index) => ({
      index,
      id: section.id,
      type: section.type,
      ...(section.hidden ? { hidden: true } : {}),
    })),
  };
}

export const sectionTools: ToolDefinition[] = [
  {
    name: "describe_sections",
    description:
      "Todas las secciones disponibles, con su esquema y un ejemplo válido de cada una. " +
      "Llama a esto antes de escribir bloques: el ejemplo dice la forma exacta que espera cada campo.",
    inputSchema: objectSchema({
      type: S.string("Sólo una sección concreta. Vacío devuelve todas."),
    }),
    handler: async (params) => {
      const type = typeof params.type === "string" ? params.type.trim() : "";
      if (type) {
        const one = describeOneSection(type);
        if (!one) throw new ToolError(`No existe la sección "${type}"`, "notFound");
        return one;
      }
      return { sections: describeAllSections() };
    },
  },

  {
    name: "describe_content_type",
    description:
      "Los campos de un tipo de contenido, con su esquema. Dice también si el tipo tiene " +
      "constructor de secciones, que es lo que decide si una página se compone de bloques.",
    inputSchema: objectSchema({ key: S.string("Clave del tipo, p. ej. «page» o «post»") }, ["key"]),
    handler: async (params, context) => {
      const key = String(params.key ?? "");
      const type = await context.db.query.contentTypes.findFirst({
        where: and(eq(contentTypes.siteId, context.siteId), eq(contentTypes.key, key)),
      });
      if (!type) throw new ToolError(`No existe el tipo "${key}"`, "notFound");

      const schema = type.fieldSchema ?? [];
      return {
        key: type.key,
        label: type.label,
        hasArchive: type.hasArchive,
        supportsChildren: type.supportsChildren,
        sectionsField: schema.find((field) => field.type === "sections")?.key ?? null,
        fields: schema.map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required ?? false,
          ...(field.options ? { options: field.options } : {}),
          ...(field.subfields ? { subfields: field.subfields } : {}),
        })),
      };
    },
  },

  {
    name: "get_sections",
    description:
      "Los bloques de una página, en orden, con su id. Los ids son estables: úsalos para " +
      "editar un bloque concreto en vez de reenviar la página entera.",
    inputSchema: objectSchema({ nodeId: S.string("Id del nodo") }, ["nodeId"]),
    handler: async (params, context) => {
      const loaded = await loadSections(context, String(params.nodeId ?? ""));
      return {
        nodeId: loaded.node.id,
        path: loaded.node.path,
        field: loaded.key,
        sections: loaded.sections,
        // Reported rather than hidden: a block the parser refused is content the client can
        // see missing from their page, and the agent is the one that can fix it.
        ...(loaded.invalid.length ? { invalid: loaded.invalid } : {}),
      };
    },
  },

  {
    name: "set_sections",
    description:
      "Reemplaza todos los bloques de una página. Conserva los ids que le pases, así que " +
      "reintentar la misma llamada no duplica nada. Para cambiar un solo bloque usa patch_section.",
    mutates: true,
    inputSchema: objectSchema(
      {
        nodeId: S.string("Id del nodo"),
        sections: S.array("Lista de bloques: {type, data, id?, anchor?, hidden?}"),
      },
      ["nodeId", "sections"]
    ),
    handler: async (params, context) => {
      const loaded = await loadSections(context, String(params.nodeId ?? ""));
      if (!Array.isArray(params.sections)) {
        throw new ToolError("«sections» tiene que ser una lista", "invalidParams");
      }
      const next = params.sections.map(materialiseSection);
      return writeSections(context, loaded, next);
    },
  },

  {
    name: "add_section",
    description: "Añade un bloque a una página, al final o en una posición concreta.",
    mutates: true,
    inputSchema: objectSchema(
      {
        nodeId: S.string("Id del nodo"),
        type: S.string("Tipo de sección"),
        data: S.object("Datos del bloque. Mira describe_sections para su forma."),
        atIndex: S.number("Posición. Vacío lo pone al final."),
        anchor: S.string("Ancla para enlazar desde un menú, p. ej. «precios»"),
      },
      ["nodeId", "type"]
    ),
    handler: async (params, context) => {
      const loaded = await loadSections(context, String(params.nodeId ?? ""));
      const section = materialiseSection({
        type: params.type,
        data: params.data ?? {},
        ...(params.anchor ? { anchor: params.anchor } : {}),
      });

      const next = [...loaded.sections];
      const at =
        typeof params.atIndex === "number"
          ? Math.max(0, Math.min(Math.trunc(params.atIndex), next.length))
          : next.length;
      next.splice(at, 0, section);

      const result = await writeSections(context, loaded, next);
      return { ...result, added: { id: section.id, index: at } };
    },
  },

  {
    name: "patch_section",
    description:
      "Cambia campos de un bloque sin tocar los demás. Esto es lo que convierte «acorta el " +
      "titular del hero» en una llamada: los campos que no envíes se quedan como estaban.",
    mutates: true,
    inputSchema: objectSchema(
      {
        nodeId: S.string("Id del nodo"),
        sectionId: S.string("Id del bloque, de get_sections"),
        data: S.object("Sólo los campos a cambiar"),
        anchor: S.string("Nueva ancla"),
        hidden: S.boolean("Ocultar el bloque sin borrarlo"),
      },
      ["nodeId", "sectionId"]
    ),
    handler: async (params, context) => {
      const loaded = await loadSections(context, String(params.nodeId ?? ""));
      const { section, index } = requireSection(loaded, String(params.sectionId ?? ""));

      const patch = (params.data && typeof params.data === "object" ? params.data : {}) as Record<string, unknown>;
      const def = getSection(section.type);
      if (def) {
        // An unknown key is refused rather than stored: silently dropping it would leave the
        // agent believing it made a change it did not make.
        const known = new Set(def.fields.map((field) => field.key));
        const unknown = Object.keys(patch).filter((key) => !known.has(key));
        if (unknown.length > 0) {
          throw new ToolError(
            `La sección "${section.type}" no tiene ${unknown.join(", ")}. Campos: ${[...known].join(", ")}.`,
            "invalidParams"
          );
        }
      }

      const next = [...loaded.sections];
      next[index] = {
        ...section,
        data: { ...section.data, ...patch },
        ...(params.anchor !== undefined ? { anchor: String(params.anchor) } : {}),
        ...(params.hidden !== undefined ? { hidden: params.hidden === true } : {}),
      };

      const result = await writeSections(context, loaded, next);
      return { ...result, patched: { id: section.id, keys: Object.keys(patch) } };
    },
  },

  {
    name: "move_section",
    description: "Cambia un bloque de posición dentro de la página.",
    mutates: true,
    inputSchema: objectSchema(
      {
        nodeId: S.string("Id del nodo"),
        sectionId: S.string("Id del bloque"),
        toIndex: S.number("Posición de destino, empezando en 0"),
      },
      ["nodeId", "sectionId", "toIndex"]
    ),
    handler: async (params, context) => {
      const loaded = await loadSections(context, String(params.nodeId ?? ""));
      const { index } = requireSection(loaded, String(params.sectionId ?? ""));
      const to = Math.trunc(Number(params.toIndex));
      if (!Number.isFinite(to)) throw new ToolError("«toIndex» tiene que ser un número", "invalidParams");

      // moveItem clamps rather than dropping, which is the same behaviour the editor's drag
      // has — and it is shared code, so the two cannot disagree.
      const next = moveItem(loaded.sections, index, to);
      const result = await writeSections(context, loaded, next);
      return { ...result, moved: { id: String(params.sectionId), from: index, to } };
    },
  },

  {
    name: "remove_section",
    description: "Quita un bloque de la página. Para conservarlo sin mostrarlo usa patch_section con hidden.",
    mutates: true,
    inputSchema: objectSchema(
      { nodeId: S.string("Id del nodo"), sectionId: S.string("Id del bloque") },
      ["nodeId", "sectionId"]
    ),
    handler: async (params, context) => {
      const loaded = await loadSections(context, String(params.nodeId ?? ""));
      const { index } = requireSection(loaded, String(params.sectionId ?? ""));
      const next = loaded.sections.filter((_, i) => i !== index);
      const result = await writeSections(context, loaded, next);
      return { ...result, removed: String(params.sectionId) };
    },
  },
];
