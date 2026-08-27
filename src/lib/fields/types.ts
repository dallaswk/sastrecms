/**
 * The field type vocabulary, declared once.
 *
 * It used to live in three places — the union in db/schema.ts, the z.enum in
 * actions/content-types.ts and the hand-written <option> list in ContentTypeBuilder.vue —
 * which is the same shape of duplication that already bit this project with
 * computePath/recomputePaths, but without a test holding it together. Deriving the type
 * from the array means a `Record<FieldType, X>` with a missing entry stops compiling,
 * which is stronger than any test.
 */
export const FIELD_TYPES = [
  "text",
  "textarea",
  "richtext",
  "image",
  "gallery",
  "date",
  "number",
  "select",
  "relation",
  "repeater",
  "sections",
  "formfields",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Labels for the content type builder. Exhaustive by construction. */
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texto",
  textarea: "Texto largo",
  richtext: "Texto enriquecido",
  image: "Imagen",
  gallery: "Galería",
  date: "Fecha",
  number: "Número",
  select: "Desplegable",
  relation: "Relación",
  repeater: "Repetidor",
  sections: "Secciones (constructor de páginas)",
  formfields: "Campos de formulario",
};

export type FieldDefinition = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** For `select`. */
  options?: string[];
  /** For `relation`: which content type the target must be. */
  relatedContentType?: string;
  /** For `repeater`: the schema each item repeats. */
  subfields?: FieldDefinition[];
  /** For `sections`: which section types this field accepts. Empty means all. */
  allowedSections?: string[];
  /** Shown under the input in the editor. Where to say *why* a field matters. */
  help?: string;
};

/**
 * The empty value a field starts from.
 *
 * Needed on both sides: the editor initialises a new node's form with it, and the server
 * fills in `fields` when something creates a node without them — the MCP surface does
 * exactly that. A `sections` field starting as `""` instead of `[]` would hand the
 * sections editor a string.
 */
export function emptyValueFor(field: FieldDefinition): unknown {
  switch (field.type) {
    case "gallery":
    case "repeater":
    case "sections":
    case "formfields":
      return [];
    case "number":
      return null;
    default:
      return "";
  }
}

export function emptyFieldsFor(schema: FieldDefinition[]): Record<string, unknown> {
  return Object.fromEntries(schema.map((f) => [f.key, emptyValueFor(f)]));
}

/**
 * The value the editor starts a field at, given what is stored.
 *
 * Shared rather than inlined in NodeForm so it can be tested and so nested editors
 * (repeater items, section blocks) coerce the same way.
 *
 * One deliberate change from the previous inline version: a number field with nothing
 * stored starts as `null`, not `""`. Saving an empty string into a number is wrong, and
 * TextField now emits `null` when the input is cleared, so both ends agree.
 */
export function initialValueFor(field: FieldDefinition, stored: unknown): unknown {
  if (stored === undefined || stored === null) return emptyValueFor(field);

  // A field that changed type — or was written by an agent — can hold the wrong shape.
  // Coerce towards the shape the editor can render instead of handing it a string.
  const empty = emptyValueFor(field);
  if (Array.isArray(empty) && !Array.isArray(stored)) return empty;
  if (field.type === "number" && typeof stored !== "number") {
    const n = Number(stored);
    return Number.isFinite(n) && stored !== "" ? n : null;
  }

  return stored;
}
