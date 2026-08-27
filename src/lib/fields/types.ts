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
