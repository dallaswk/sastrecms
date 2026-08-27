import type { FieldDefinition } from "@lib/fields/types";

/**
 * Which renderer a node uses.
 *
 * Pulled out of the ternary that lived in [...slug].astro so it can be tested, and
 * because that ternary hid a real hole: anything that was not post, portfolio_item or an
 * archive fell through to PageRenderer, which painted `fields.body` and nothing else. A
 * custom content type's fields never reached the page — the builder promised flexibility
 * and shipped identical pages.
 */
export type RendererKey = "sections" | "archive" | "post" | "portfolio_item" | "generic";

export type RenderableType = {
  key: string;
  hasArchive: boolean;
  fieldSchema?: FieldDefinition[] | null;
};

/** The section-builder field of a content type, if it declares one. */
export function sectionsFieldOf(ct: RenderableType | null | undefined): FieldDefinition | null {
  return (ct?.fieldSchema ?? []).find((f) => f.type === "sections") ?? null;
}

/**
 * Three layers, in order:
 *
 * 1. The type has a sections field *and* the node has blocks in it → the sections are the
 *    page. No title is imposed: if you want one, you add a hero.
 * 2. A purpose-built renderer exists → archive, post, portfolio_item.
 * 3. Otherwise → generic, which walks the field schema and paints every field.
 */
/**
 * Where the node sits in the tree.
 *
 * Needed because `hasArchive` is a property of the *type*, not of the node: a post type has
 * an archive, but only one node of that type is the archive. Without this, every individual
 * post was rendered by ArchiveRenderer — which lists a node's children — so a post leaf
 * showed its title and «No hay entradas todavía» and its body never appeared at all.
 */
export type NodePosition = {
  /** True when the node has children to list. */
  hasChildren?: boolean;
  /** True when the node is top level, which is where a listing lives. */
  isRoot?: boolean;
};

export function resolveRenderer(
  ct: RenderableType | null | undefined,
  fields?: Record<string, unknown> | null,
  position?: NodePosition
): RendererKey {
  const sectionsField = sectionsFieldOf(ct);
  if (sectionsField) {
    const value = fields?.[sectionsField.key];
    if (Array.isArray(value) && value.length > 0) return "sections";
  }

  if (!ct) return "generic";

  // A listing either has entries to list, or is the root that will have them. A leaf falls
  // through to its own renderer. `isRoot` keeps an empty archive still showing as an archive
  // instead of turning into a single post the moment its last entry is deleted.
  if (ct.hasArchive && (position?.hasChildren || position?.isRoot)) return "archive";

  if (ct.key === "post" || ct.key === "portfolio_item") return ct.key;
  return "generic";
}
