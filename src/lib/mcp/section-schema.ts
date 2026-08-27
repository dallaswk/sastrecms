import { SECTIONS, pickableSections } from "@lib/sections/registry";
import type { SectionDefinition } from "@lib/sections/types";
import type { FieldDefinition } from "@lib/fields/types";

/**
 * Turning the section registry into something an agent can author against.
 *
 * The schema alone is not enough. For a model, a valid example is worth more than a type
 * definition — it settles the shape of a repeater, whether an option is a label or a key, and
 * what a plausible value looks like, all at once. So every section is described with both, and
 * the example is generated from the definition rather than written by hand, which means it
 * cannot go stale when a field is added.
 */

/** One field as JSON Schema. */
function fieldSchema(field: FieldDefinition): Record<string, unknown> {
  const base: Record<string, unknown> = { description: field.label };

  switch (field.type) {
    case "number":
      return { ...base, type: "number" };
    case "date":
      return { ...base, type: "string", format: "date", examples: ["2026-09-15"] };
    case "select":
      return { ...base, type: "string", enum: field.options ?? [] };
    case "richtext":
      return {
        ...base,
        type: "string",
        description: `${field.label}. HTML sencillo: p, strong, em, ul, li, a, h2, h3. Se sanea al guardar.`,
      };
    case "image":
      return {
        ...base,
        type: "string",
        description: `${field.label}. URL de un archivo de la biblioteca de medios.`,
      };
    case "gallery":
      return { ...base, type: "array", items: { type: "string" } };
    case "relation":
      return {
        ...base,
        type: "string",
        description: `${field.label}. Id de un nodo${field.relatedContentType ? ` de tipo "${field.relatedContentType}"` : ""}.`,
      };
    case "repeater":
      return {
        ...base,
        type: "array",
        items: {
          type: "object",
          properties: Object.fromEntries(
            (field.subfields ?? []).map((sub) => [sub.key, fieldSchema(sub)])
          ),
          required: (field.subfields ?? []).filter((sub) => sub.required).map((sub) => sub.key),
        },
      };
    case "formfields":
      return {
        ...base,
        type: "array",
        description: `${field.label}. Cada campo: {key, label, type, required?}.`,
        items: { type: "object" },
      };
    case "sections":
      return { ...base, type: "array", items: { type: "object" } };
    default:
      return { ...base, type: "string" };
  }
}

/** A plausible value for a field, so the example reads like real content. */
function exampleValue(field: FieldDefinition, def: SectionDefinition): unknown {
  // The definition's own default is the best possible example: it is what the editor sees
  // when they add the block.
  const fromDefaults = def.defaults?.[field.key];
  if (fromDefaults !== undefined) return fromDefaults;

  switch (field.type) {
    case "number":
      return 3;
    case "date":
      return "2026-09-15";
    case "select":
      return field.options?.[0] ?? "";
    case "richtext":
      return `<p>${field.label}.</p>`;
    case "image":
      return "https://media.tu-dominio.com/site_x/media_abc123.jpg";
    case "gallery":
      return ["https://media.tu-dominio.com/site_x/media_abc123.jpg"];
    case "relation":
      return "node_xxxxxxxx";
    case "repeater":
      return [
        Object.fromEntries(
          (field.subfields ?? []).map((sub) => [sub.key, exampleValue(sub, def)])
        ),
      ];
    case "formfields":
      return [{ key: "nombre", label: "Nombre", type: "text", required: "sí" }];
    case "sections":
      return [];
    default:
      return field.label;
  }
}

export type SectionDescription = {
  type: string;
  label: string;
  description: string;
  group: string;
  version: number;
  deprecated?: boolean;
  inputSchema: Record<string, unknown>;
  /** A complete, valid instance. What a model actually copies. */
  example: Record<string, unknown>;
};

export function describeSection(def: SectionDefinition): SectionDescription {
  const properties = Object.fromEntries(def.fields.map((field) => [field.key, fieldSchema(field)]));
  const required = def.fields.filter((field) => field.required).map((field) => field.key);

  return {
    type: def.type,
    label: def.label,
    description: def.description,
    group: def.group,
    version: def.version,
    ...(def.deprecated ? { deprecated: true } : {}),
    inputSchema: {
      type: "object",
      properties,
      ...(required.length ? { required } : {}),
      additionalProperties: false,
    },
    example: {
      type: def.type,
      v: def.version,
      data: Object.fromEntries(def.fields.map((field) => [field.key, exampleValue(field, def)])),
    },
  };
}

/**
 * Every section an agent may use.
 *
 * Retired sections are excluded: an agent offered a deprecated block would use it, and the
 * whole point of `deprecated` is that no new content should carry it.
 */
export function describeAllSections(): SectionDescription[] {
  return pickableSections().map(describeSection);
}

export function describeOneSection(type: string): SectionDescription | null {
  const def = SECTIONS[type];
  return def ? describeSection(def) : null;
}
