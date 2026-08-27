import type { FieldDefinition } from "./fields/types";

/**
 * Whether a page shows anything.
 *
 * One definition, because there were two and they disagreed. The dashboard checked for section
 * blocks first and the AI task only looked for extractable text — so the three legal pages, whose
 * `legal` block generates its whole text at render time from the business data, counted as empty
 * and were offered up for the AI to write over. Writing invented legal text on top of correctly
 * generated legal text is about the worst thing this feature could do.
 *
 * The rule: a page has content if it has any block at all, or a body with text in it. What a
 * block renders is the block's business, not this function's.
 */
/**
 * The key a type's blocks live under, or null.
 *
 * Duplicating `sectionsFieldOf`'s one line rather than importing it: that one takes the whole
 * RenderableType, and this function is called with anything that happens to have a fieldSchema —
 * a partial select from the dashboard, a joined row from an action.
 */
function sectionsKeyOf(
  contentType: { fieldSchema?: FieldDefinition[] } | null | undefined
): string | null {
  return contentType?.fieldSchema?.find((field) => field.type === "sections")?.key ?? null;
}

export function hasVisibleContent(
  fields: unknown,
  contentType: { fieldSchema?: FieldDefinition[] } | null | undefined
): boolean {
  const values = (fields ?? {}) as Record<string, unknown>;

  const sectionsKey = sectionsKeyOf(contentType);
  if (sectionsKey) {
    const blocks = values[sectionsKey];
    if (Array.isArray(blocks) && blocks.length > 0) return true;
  }

  const body = values.body;
  return typeof body === "string" && body.trim().length > 0;
}

/**
 * Blocks that write their own content and must never be regenerated.
 *
 * A legal document comes from the business data; a contact form comes from its own field list.
 * Neither has prose an AI could improve, and both would be destroyed by the attempt.
 */
export const SELF_WRITING_SECTIONS = ["legal", "contact"];

/** True when every block on the page writes itself, so there is nothing to compose. */
export function isSelfWriting(
  fields: unknown,
  contentType: { fieldSchema?: FieldDefinition[] } | null | undefined
): boolean {
  const sectionsKey = sectionsKeyOf(contentType);
  if (!sectionsKey) return false;

  const blocks = (fields as Record<string, unknown>)?.[sectionsKey];
  if (!Array.isArray(blocks) || blocks.length === 0) return false;

  return blocks.every((block) =>
    SELF_WRITING_SECTIONS.includes((block as { type?: string })?.type ?? "")
  );
}
