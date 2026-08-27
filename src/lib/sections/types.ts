import type { FieldDefinition } from "@lib/fields/types";

/**
 * A section type, declared once and read by the editor, the renderer, the server-side
 * validation and the MCP schema.
 *
 * Sections reuse `FieldDefinition` rather than inventing a parallel field system: a
 * section's editor is the same FieldRenderer the node form already uses, so a new block
 * costs a definition and an .astro component, not a new UI.
 */
export type SectionDefinition = {
  /**
   * Stable key. Never renamed — it is written into every client's stored content.
   * Retiring a section means `deprecated: true`, never deleting the entry.
   */
  type: string;
  label: string;
  /** Read by a human in the picker and by an agent through MCP. Say what it is *for*. */
  description: string;
  group: SectionGroup;
  icon?: string;
  /**
   * Bumped only on an incompatible change: a renamed key, a changed type, a removal.
   * Adding an optional field is not a version bump — `defaults` covers it.
   */
  version: number;
  fields: FieldDefinition[];
  defaults?: Record<string, unknown>;
  /** Must be total: never throws. Given rubbish, return whatever is usable. */
  migrate?: (data: Record<string, unknown>, from: number) => Record<string, unknown>;
  /** Hidden from the picker, still rendered for content that already uses it. */
  deprecated?: boolean;
};

export const SECTION_GROUPS = [
  "cabecera",
  "contenido",
  "prueba-social",
  "conversion",
  "medios",
] as const;

export type SectionGroup = (typeof SECTION_GROUPS)[number];

export const SECTION_GROUP_LABELS: Record<SectionGroup, string> = {
  cabecera: "Cabecera",
  contenido: "Contenido",
  "prueba-social": "Prueba social",
  conversion: "Conversión",
  medios: "Medios",
};

/** One block, as stored inside `nodes.fields.<key>`. */
export type SectionInstance = {
  /**
   * Persisted, unlike the repeater's throwaway local id. Three reasons: a stable `:key`
   * while dragging, an anchor an agent can address ("update sec_abc" rather than "the
   * third one"), and the idempotency key that makes a retried set_sections safe.
   */
  id: string;
  type: string;
  /** Schema version this data was written against. Per instance: blocks evolve apart. */
  v: number;
  data: Record<string, unknown>;
  /** Kept in the document but not rendered. */
  hidden?: boolean;
  /** `#anchor` for menu links. Falls back to the id. */
  anchor?: string;
};

/** Why one section failed, precise enough for an agent to fix it in one turn. */
export type SectionError = {
  index: number;
  type?: string;
  key?: string;
  message: string;
};
