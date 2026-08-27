import { generateId } from "@lib/id";
import { initialValueFor, type FieldDefinition } from "@lib/fields/types";
import { getSection } from "./registry";
import type { SectionError, SectionInstance } from "./types";

/**
 * Turns whatever is stored — or whatever an agent sent — into sections the renderer can
 * trust.
 *
 * This is not optional hygiene. Sections live in `nodes.fields`, which the actions accept
 * as `z.record(z.string(), z.unknown())`, and the renderer paints rich text with
 * `set:html`. Validating here is the condition that made storing them as JSON the right
 * call rather than a shortcut.
 *
 * Never throws: a broken block degrades to an error for that block, and the rest of the
 * page still renders.
 */
export function parseSections(
  raw: unknown,
  opts: { allowed?: string[]; strict?: boolean } = {}
): { sections: SectionInstance[]; errors: SectionError[] } {
  const errors: SectionError[] = [];

  if (raw === undefined || raw === null || raw === "") return { sections: [], errors };
  if (!Array.isArray(raw)) {
    return {
      sections: [],
      errors: [{ index: -1, message: "El campo de secciones debe ser una lista." }],
    };
  }

  const sections: SectionInstance[] = [];

  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push({ index, message: "Cada sección debe ser un objeto." });
      return;
    }

    const candidate = entry as Partial<SectionInstance>;
    const type = typeof candidate.type === "string" ? candidate.type : "";
    const def = getSection(type);

    if (!def) {
      // Reported, never dropped in silence: an agent inventing a type has to hear about
      // it, and a human losing a block to a rename has to be able to see why.
      errors.push({ index, type: type || undefined, message: `Sección desconocida: "${type}".` });
      return;
    }

    if (opts.allowed?.length && !opts.allowed.includes(type)) {
      errors.push({
        index,
        type,
        message: `La sección "${type}" no está permitida en este tipo de contenido.`,
      });
      return;
    }

    const from = typeof candidate.v === "number" ? candidate.v : 1;
    const rawData =
      candidate.data && typeof candidate.data === "object" && !Array.isArray(candidate.data)
        ? (candidate.data as Record<string, unknown>)
        : {};

    let migrated = rawData;
    if (from !== def.version && def.migrate) {
      try {
        migrated = def.migrate(rawData, from) ?? {};
      } catch {
        // A migrate that throws must not blank the page; fall back to the raw data and
        // let coercion below salvage what it can.
        errors.push({ index, type, message: "La migración de esta sección falló." });
        migrated = rawData;
      }
    }

    const { data, missing } = coerceSectionData(def.fields, migrated, def.defaults);
    for (const key of missing) {
      errors.push({ index, type, key, message: `Falta el campo requerido "${key}".` });
    }
    if (opts.strict && missing.length) return;

    sections.push({
      id: typeof candidate.id === "string" && candidate.id ? candidate.id : generateId("sec"),
      type,
      v: def.version,
      data,
      ...(candidate.hidden ? { hidden: true } : {}),
      ...(typeof candidate.anchor === "string" && candidate.anchor
        ? { anchor: candidate.anchor }
        : {}),
    });
  });

  return { sections, errors };
}

/**
 * Fills in defaults, coerces shapes and drops keys the section does not declare.
 *
 * Dropping unknown keys is deliberate: without it, a renamed field leaves its old value
 * behind forever and every page carries dead data an agent will keep copying forward.
 */
export function coerceSectionData(
  fields: FieldDefinition[],
  data: Record<string, unknown>,
  defaults?: Record<string, unknown>
): { data: Record<string, unknown>; missing: string[] } {
  const out: Record<string, unknown> = {};
  const missing: string[] = [];

  for (const field of fields) {
    const stored = data[field.key] ?? defaults?.[field.key];
    const value = initialValueFor(field, stored);
    out[field.key] = value;

    if (field.required && (value === "" || value === null || value === undefined)) {
      missing.push(field.key);
    }
  }

  return { data: out, missing };
}

/** One line per problem, naming index, type and key so it can be acted on. */
export function formatSectionErrors(errors: SectionError[]): string {
  return errors
    .map((e) => {
      const where = e.index >= 0 ? `sección ${e.index + 1}` : "el campo de secciones";
      const what = [e.type && `tipo "${e.type}"`, e.key && `campo "${e.key}"`]
        .filter(Boolean)
        .join(", ");
      return what ? `${where} (${what}): ${e.message}` : `${where}: ${e.message}`;
    })
    .join(" · ");
}
