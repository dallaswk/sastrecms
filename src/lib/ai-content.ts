import { getSection, pickableSections } from "@lib/sections/registry";
import { describeSection } from "@lib/mcp/section-schema";
import type { SectionInstance } from "@lib/sections/types";
import type { SiteContext } from "./ai-tasks";

/**
 * Generating the blocks of a page, rather than a sentence.
 *
 * Three things make this different from the description task, and each one is a place it fails:
 *
 *  - **The output is structured.** A sentence either reads well or it does not; a block list is
 *    either valid against seventeen section schemas or it silently loses fields. The same trap
 *    the MCP surface hit on its first real call: send `button_label` to a hero whose field is
 *    `cta_label` and the value disappears with no error.
 *  - **It is ten times the volume.** Confabulation that produces one wrong sentence produces
 *    four wrong paragraphs here, and four paragraphs of confident nonsense read as a finished
 *    page. So a hint from a person is *required*, not optional.
 *  - **Most sections cannot be invented.** A gallery needs real images, a team needs real people,
 *    pricing needs real prices. Offering them to a model is asking it to make those up.
 */

/**
 * The sections a model may use.
 *
 * Everything excluded is excluded because its content cannot be invented, not because it is
 * complicated: `gallery` and `logos` need files that exist, `team` needs real names, `pricing`
 * needs real prices, `collection` needs a real target page, `contact` and `legal` are configured
 * rather than written. A model handed those fills them with plausible fiction, and plausible
 * fiction in a price table is worse than an empty page.
 */
export const CONTENT_SECTIONS = [
  "hero",
  "prose",
  "features",
  "steps",
  "split",
  "faq",
  "quotes",
  "stats",
  "cta",
] as const;

export const MIN_BLOCKS = 3;
export const MAX_BLOCKS = 6;

export const CONTENT_SYSTEM =
  "Eres redactor y maquetador de páginas web en castellano de España. Compones una página a " +
  "partir de bloques predefinidos y devuelves JSON.\n\n" +
  "Reglas:\n" +
  `- Devuelve ÚNICAMENTE un array JSON de entre ${MIN_BLOCKS} y ${MAX_BLOCKS} bloques. Sin texto ` +
  "antes ni después, sin ```json.\n" +
  '- Cada bloque es {"type": "...", "data": {...}}.\n' +
  "- Usa EXACTAMENTE las claves de campo que te doy para cada tipo. Una clave que no esté en la " +
  "lista se descarta y el contenido se pierde.\n" +
  "- Empieza por un `hero` y termina por un `cta`.\n" +
  "- Escribe textos concretos sobre lo que la persona te ha contado. No inventes datos que no " +
  "te haya dado: ni cifras, ni años de experiencia, ni nombres, ni precios, ni premios.\n" +
  "- Nada de «Descubre», «Bienvenido a», «líder en» ni «soluciones a medida».\n" +
  "- Los campos de imagen déjalos como cadena vacía: no hay imágenes que puedas elegir.";

/** A compact schema for the prompt: field keys and what each one is. */
function compactSchema(type: string): string | null {
  const def = getSection(type);
  if (!def) return null;

  const fields = def.fields
    .map((field) => {
      const bits = [`${field.key} (${field.type}`];
      if (field.required) bits.push(", obligatorio");
      bits.push(")");
      if (field.options?.length) bits.push(`: ${field.options.join(" | ")}`);
      if (field.type === "repeater" && field.subfields?.length) {
        bits.push(` [cada ítem: ${field.subfields.map((sub) => sub.key).join(", ")}]`);
      }
      return bits.join("");
    })
    .join("; ");

  return `${def.type} — ${def.label}. Campos: ${fields}`;
}

/**
 * The catalogue the model gets.
 *
 * Schemas rather than full examples: an example per section for nine sections is most of the
 * prompt, and for *composing* a page the field names are what matter. The description task is
 * the opposite — one section, and the example is worth more than the schema.
 */
export function sectionCatalogue(): string {
  return CONTENT_SECTIONS.map(compactSchema).filter(Boolean).join("\n");
}

export type ContentPage = {
  title: string;
  path: string;
  /** What the person said this page is for. Required: see the note at the top. */
  hint: string;
};

export function contentPrompt(
  site: SiteContext,
  page: ContentPage
): { system: string; prompt: string } {
  const parts = [
    `Sitio: ${site.siteName}`,
    ...(site.tagline?.trim() ? [`Lema: ${site.tagline.trim()}`] : []),
    ...(site.activity?.trim() ? [`Actividad: ${site.activity.trim()}`] : []),
    "",
    `Página a componer: «${page.title}» en ${page.path}`,
    "",
    "Lo que la persona que gestiona el sitio dice de esta página:",
    page.hint.trim(),
  ];

  if (site.otherPages.length) {
    // So a CTA can point at a page that exists instead of inventing /presupuesto.
    parts.push(
      "",
      `Páginas que existen en el sitio, para los enlaces: ${site.otherPages
        .slice(0, 12)
        .map((other) => other.path)
        .join(", ")}`,
      "No enlaces a ninguna ruta que no esté en esa lista."
    );
  }

  parts.push("", "Bloques disponibles:", sectionCatalogue());

  return { system: CONTENT_SYSTEM, prompt: parts.join("\n") };
}

/* ------------------------------------------------------- leer lo que devuelve */

/**
 * Finds the JSON array in a model's answer.
 *
 * Told to return only JSON, a model returns it inside a ```json fence, or with «Aquí tienes la
 * página:» in front, or both. Every branch here is something one actually did — and a parse that
 * gives up on the first failure turns a usable answer into an error the person cannot act on.
 */
export function extractJsonArray(raw: unknown): { ok: true; value: unknown[] } | { ok: false; reason: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, reason: "El modelo no ha devuelto nada." };
  }

  let text = raw.trim();

  // A fenced block, with or without a language tag.
  const fenced = /```(?:json|javascript|js)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) text = fenced[1].trim();

  // Prose before or after. Take from the first `[` to its matching `]` rather than the last one
  // in the string: trailing commentary can contain brackets of its own.
  const start = text.indexOf("[");
  if (start === -1) {
    // Some models answer with a single object when asked for a list of one.
    const objectStart = text.indexOf("{");
    if (objectStart === -1) return { ok: false, reason: "La respuesta no contiene JSON." };
    text = `[${text.slice(objectStart)}]`;
  } else {
    let depth = 0;
    let end = -1;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const char = text[i]!;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "[") depth++;
      if (char === "]") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) return { ok: false, reason: "El JSON está cortado: no cierra el array." };
    text = text.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return { ok: false, reason: "El JSON no es una lista de bloques." };
    return { ok: true, value: parsed };
  } catch (error) {
    return {
      ok: false,
      reason: `El JSON no se puede leer: ${error instanceof Error ? error.message : "error"}.`,
    };
  }
}

export type BlockIssue = { index: number; type?: string; message: string };

export type BlockCheck = {
  /** Only the blocks that survived. Never partially valid ones. */
  blocks: SectionInstance[];
  /** What was dropped and why. Shown to the person, and reusable as a re-prompt. */
  issues: BlockIssue[];
};

/**
 * Validates a model's blocks without throwing.
 *
 * The MCP path throws on the first bad block, which is right for an API — the caller should fix
 * it and retry. Here the person is looking at the result, so a page with one bad block out of
 * five should show the four and say what happened to the fifth.
 *
 * Unknown field keys are dropped *and reported*, never dropped silently: silently is how the MCP
 * surface returned success for a hero with no button.
 */
export function checkBlocks(parsed: unknown[], makeId: () => string): BlockCheck {
  const blocks: SectionInstance[] = [];
  const issues: BlockIssue[] = [];

  parsed.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push({ index, message: "No es un objeto." });
      return;
    }

    const input = raw as Record<string, unknown>;
    const type = typeof input.type === "string" ? input.type : "";
    const def = getSection(type);

    if (!def) {
      issues.push({ index, type, message: `No existe la sección «${type || "(sin tipo)"}».` });
      return;
    }
    if (!(CONTENT_SECTIONS as readonly string[]).includes(type)) {
      issues.push({
        index,
        type,
        message: `«${type}» no se puede generar: su contenido no se puede inventar.`,
      });
      return;
    }

    const data = (input.data && typeof input.data === "object" ? input.data : {}) as Record<string, unknown>;
    const known = new Set(def.fields.map((field) => field.key));

    const unknown = Object.keys(data).filter((key) => !known.has(key));
    const clean: Record<string, unknown> = {};
    for (const field of def.fields) {
      if (data[field.key] !== undefined) clean[field.key] = data[field.key];
      else if (def.defaults?.[field.key] !== undefined) clean[field.key] = def.defaults[field.key];
    }

    if (unknown.length) {
      issues.push({
        index,
        type,
        message: `Claves que no existen y se han descartado: ${unknown.join(", ")}.`,
      });
    }

    const missing = def.fields
      .filter((field) => field.required)
      .filter((field) => {
        const value = clean[field.key];
        return value === undefined || value === "" || value === null;
      })
      .map((field) => field.key);

    if (missing.length) {
      issues.push({ index, type, message: `Falta lo obligatorio: ${missing.join(", ")}.` });
      return;
    }

    blocks.push({ id: makeId(), type, v: def.version, data: clean });
  });

  return { blocks, issues };
}

/**
 * A readable summary of the proposed page.
 *
 * The review step for a description is reading one sentence. For a page it is deciding whether
 * six blocks say the right thing, and raw JSON is the wrong shape for that decision — so each
 * block is reduced to its type and its most human field.
 */
export function summariseBlocks(blocks: SectionInstance[]): { type: string; label: string; text: string }[] {
  return blocks.map((block) => {
    const def = getSection(block.type);
    const data = block.data as Record<string, unknown>;

    // The first text-bearing field, in the order the section declares them: that is the one the
    // section's own author considered most important.
    const primary = def?.fields.find(
      (field) =>
        ["text", "textarea", "richtext"].includes(field.type) &&
        typeof data[field.key] === "string" &&
        (data[field.key] as string).trim()
    );

    const raw = primary ? (data[primary.key] as string) : "";
    // The space before punctuation is what stripping `</strong>.` leaves behind, and a summary
    // that reads «precio cerrado .» looks like the content itself is broken.
    const text = raw
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s+([.,;:!?…])/g, "$1")
      .trim();

    // A repeater's item count says more than its first item's title.
    const repeater = def?.fields.find(
      (field) => field.type === "repeater" && Array.isArray(data[field.key])
    );
    const count = repeater ? (data[repeater.key] as unknown[]).length : 0;

    return {
      type: block.type,
      label: def?.label ?? block.type,
      text: count > 0 ? `${text || def?.label} · ${count} ítem(s)` : text,
    };
  });
}

/** Which section types are offered, for the panel's own copy. */
export function contentSectionLabels(): string[] {
  return pickableSections()
    .filter((def) => (CONTENT_SECTIONS as readonly string[]).includes(def.type))
    .map((def) => def.label);
}

/** Re-prompt text built from what went wrong, so a retry is not the same request. */
export function issuesAsInstruction(issues: BlockIssue[]): string {
  if (!issues.length) return "";
  return (
    "El intento anterior tuvo estos problemas. Corrígelos:\n" +
    issues.map((issue) => `- bloque ${issue.index + 1}${issue.type ? ` (${issue.type})` : ""}: ${issue.message}`).join("\n")
  );
}
