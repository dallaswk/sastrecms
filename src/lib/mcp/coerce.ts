import { coerceSectionData } from "@lib/sections/validate";
import { getSection } from "@lib/sections/registry";
import { generateId } from "@lib/id";
import { ToolError } from "./types";
import type { SectionInstance } from "@lib/sections/types";

/**
 * Turning a block an agent described into one that can be stored.
 *
 * Shared by every tool that accepts blocks, because the guard that matters has to be in all of
 * them: **an unknown field key is refused, not dropped.**
 *
 * `coerceSectionData` keeps only declared fields, which is right for the editor — a field
 * removed from a section should not resurrect from old stored data. But for an agent it is the
 * wrong answer: send `button_label` to a hero whose field is `cta_label` and the call returns
 * success, the key vanishes, and the page is published with no button. The agent has no way to
 * know. It happened on the first real end-to-end call of this endpoint.
 */
export function materialiseSection(raw: unknown): SectionInstance {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = typeof input.type === "string" ? input.type : "";

  const def = getSection(type);
  if (!def) {
    throw new ToolError(
      `No existe la sección "${type}". Usa describe_sections para ver las disponibles.`,
      "invalidParams"
    );
  }

  const data = (input.data && typeof input.data === "object" ? input.data : {}) as Record<string, unknown>;

  const known = new Set(def.fields.map((field) => field.key));
  const unknown = Object.keys(data).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new ToolError(
      `La sección "${type}" no tiene ${unknown.join(", ")}. Sus campos son: ${[...known].join(", ")}.`,
      "invalidParams",
      { section: type, unknown, fields: [...known] }
    );
  }

  const coerced = coerceSectionData(def.fields, data, def.defaults);
  if (coerced.missing.length > 0) {
    throw new ToolError(
      `La sección "${type}" necesita: ${coerced.missing.join(", ")}.`,
      "invalidParams",
      { section: type, missing: coerced.missing }
    );
  }

  return {
    // A caller-supplied id is kept: that is what makes a retried write idempotent instead of
    // duplicating every block.
    id: typeof input.id === "string" && input.id ? input.id : generateId("sec"),
    type,
    v: def.version,
    data: coerced.data,
    ...(input.hidden === true ? { hidden: true } : {}),
    ...(typeof input.anchor === "string" && input.anchor ? { anchor: input.anchor } : {}),
  };
}
