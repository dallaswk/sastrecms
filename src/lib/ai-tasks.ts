/**
 * The AI-assisted fixes: what goes into the prompt, and what comes back.
 *
 * Both halves are here and tested, because both are where this goes wrong in ways that are hard
 * to see. A prompt without real site context produces text that is grammatical and says nothing
 * — «Descubre nuestros servicios de calidad» — which passes a glance and is worthless. And a
 * model's raw output is never clean: it wraps things in quotes, prefixes «Meta descripción:»,
 * adds a trailing full stop where there was none, and overshoots any length you ask for.
 *
 * Nothing here writes. A proposal is shown, edited and accepted by a person; that was a
 * deliberate choice and it is the reason this module has no database access at all.
 */

export const AI_TASKS = ["descriptions", "alt", "empty-pages"] as const;
export type AiTaskId = (typeof AI_TASKS)[number];

/* --------------------------------------------------------------- el contexto */

/** What every prompt gets: who the site is. Without this the output is interchangeable. */
export type SiteContext = {
  siteName: string;
  tagline?: string;
  /** From the business data, when it is filled in. Says what the company actually does. */
  activity?: string;
  /** Titles and paths of the other pages, so the model knows what site this is. */
  otherPages: { title: string; path: string }[];
};

export type DescriptionItem = {
  id: string;
  path: string;
  title: string;
  /** The page's own visible text, trimmed. What the description has to actually describe. */
  content: string;
  /** Descriptions already written on this site, so they do not all end up sounding alike. */
  siblings: string[];
  /**
   * A line from the person about what this page is for.
   *
   * Supplied when the page has no text of its own. It replaces the «do not invent» warning
   * rather than being appended after it: with both in the prompt the model reads the warning as
   * the stronger instruction and refuses even when a person has just told it the answer.
   */
  hint?: string;
};

export type AltItem = {
  id: string;
  /** The filename, which is often the only clue. */
  filename: string;
  url: string;
  /** Where it is used, if anywhere: a team photo and a hero background want different alts. */
  usedOn: string[];
};

/** Length budget for a meta description. Google truncates around here on desktop. */
export const DESCRIPTION_LIMITS = { min: 70, ideal: 155, max: 165 } as const;

/** Alt text is a sentence, not a paragraph. Screen readers read it in one breath. */
export const ALT_LIMITS = { min: 8, ideal: 100, max: 125 } as const;

/* ----------------------------------------------------------------- prompts */

const SYSTEM_DESCRIPTION =
  "Eres redactor de contenidos web en castellano de España. Escribes meta descripciones: " +
  "una frase que resume la página para quien la ve en Google y le da un motivo para entrar. " +
  "Reglas: entre 70 y 155 caracteres; nada de comillas; no empieces con el nombre de la " +
  "empresa; no uses «Descubre», «Bienvenido a» ni «líder en»; concreta lo que la página ofrece " +
  "de verdad. Responde ÚNICAMENTE con la frase, sin prefijos ni explicaciones.";

const SYSTEM_ALT =
  "Describes imágenes para personas que usan lector de pantalla, en castellano de España. " +
  "Una frase corta que diga qué se ve, no qué representa. Reglas: menos de 125 caracteres; " +
  "no empieces con «Imagen de» ni «Foto de»; nada de comillas. Si con la información que te dan " +
  "no puedes saber qué se ve, responde exactamente: NO_SE_PUEDE. " +
  "Responde ÚNICAMENTE con la frase.";

export function siteBlurb(site: SiteContext): string {
  const parts = [`Sitio: ${site.siteName}`];
  if (site.tagline?.trim()) parts.push(`Lema: ${site.tagline.trim()}`);
  if (site.activity?.trim()) parts.push(`Actividad: ${site.activity.trim()}`);
  if (site.otherPages.length) {
    parts.push(
      `Otras páginas del sitio: ${site.otherPages
        .slice(0, 12)
        .map((page) => `${page.title} (${page.path})`)
        .join("; ")}`
    );
  }
  return parts.join("\n");
}

export function descriptionPrompt(
  site: SiteContext,
  item: DescriptionItem
): { system: string; prompt: string } {
  const parts = [
    siteBlurb(site),
    "",
    `Página: ${item.title} — ${item.path}`,
  ];

  if (item.content.trim()) {
    // Truncated: a whole page of sections would dominate the prompt and cost tokens for text
    // the first paragraph already establishes.
    parts.push("", "Contenido de la página:", item.content.slice(0, 1500));
  } else if (item.hint?.trim()) {
    // A person has said what the page is for, so there is nothing left to invent.
    parts.push(
      "",
      "La página no tiene texto todavía, pero la persona que gestiona el sitio dice de qué va:",
      item.hint.trim(),
      "",
      "Escribe la descripción a partir de eso. No añadas nada sobre el sector que no esté ahí."
    );
  } else {
    /*
     * A page with no text is where this goes wrong.
     *
     * Asked to write from a title and a tagline, the model fills the gap with whatever the words
     * suggest. On this very project it read «sASTRe» and «Astro» as astronomy and produced
     * «artículos sobre astrofísica y la pasión por el cosmos» for a CMS blog. Grammatical,
     * confident, and about a different website.
     *
     * So it is told not to guess, and the caller is expected to have asked the person for a hint
     * first — which `needsHint` below is for.
     */
    parts.push(
      "",
      "ATENCIÓN: esta página no tiene texto todavía. NO inventes de qué trata el sitio ni el " +
        "sector al que pertenece. Limítate a lo que dicen literalmente el título de la página, " +
        "el nombre del sitio y el lema. Si con eso no puedes escribir algo cierto, responde " +
        "exactamente: NO_SE_PUEDE."
    );
  }

  if (item.siblings.length) {
    // The single detail that stops nine descriptions reading as nine variations of one.
    parts.push(
      "",
      "Descripciones que ya existen en este sitio. Escribe una distinta, no una variación:",
      ...item.siblings.slice(0, 6).map((sibling) => `- ${sibling}`)
    );
  }

  return { system: SYSTEM_DESCRIPTION, prompt: parts.join("\n") };
}

export function altPrompt(site: SiteContext, item: AltItem): { system: string; prompt: string } {
  const parts = [siteBlurb(site), "", `Nombre del archivo: ${item.filename}`];
  if (item.usedOn.length) {
    parts.push(`Se usa en: ${item.usedOn.join(", ")}`);
  } else {
    parts.push("No está usada en ninguna página todavía.");
  }
  parts.push(
    "",
    "Con esa información, describe qué se ve en la imagen. Si el nombre del archivo no dice " +
      "nada (por ejemplo «IMG_4821.jpg») y no hay más pistas, responde NO_SE_PUEDE."
  );
  return { system: SYSTEM_ALT, prompt: parts.join("\n") };
}

/**
 * Whether this item needs a hint from a person before the model is asked.
 *
 * True when there is no page text to work from: the model has only a title and a tagline, and
 * what it does with that is invent a sector. One line from whoever knows the business is worth
 * more than any amount of prompt engineering here.
 */
export function needsHint(item: { content: string }): boolean {
  return item.content.trim().length < 40;
}

/* -------------------------------------------------------- limpiar la salida */

/** Openings that mark filler, whatever else the sentence says. */
const BANNED_OPENINGS = [
  /^descubre\b/i,
  /^bienvenid[oa]s?\b/i,
  /^en\s+\w+\s+somos\s+l[íi]der/i,
  /^somos\s+l[íi]der/i,
  /^imagen\s+de\b/i,
  /^foto(graf[íi]a)?\s+de\b/i,
];

/** Prefixes a model adds when told to answer with only the sentence, and does anyway. */
const PREFIXES = [
  /^meta\s*descripci[óo]n\s*:\s*/i,
  /^descripci[óo]n\s*:\s*/i,
  /^texto\s+alternativo\s*:\s*/i,
  /^alt\s*:\s*/i,
  /^respuesta\s*:\s*/i,
];

/**
 * Turns a model's answer into something storable.
 *
 * Every step here corresponds to something models actually do: wrapping the whole answer in
 * quotes, prefixing it with the field name, answering in two paragraphs when asked for one
 * sentence, and adding a closing full stop the surrounding UI then duplicates.
 */
export function cleanProposal(raw: unknown): string {
  if (typeof raw !== "string") return "";

  let text = raw.trim();

  // A model asked for one sentence sometimes explains itself on a second line.
  text = text.split(/\n{2,}/)[0]!.replace(/\s*\n\s*/g, " ").trim();

  for (const prefix of PREFIXES) text = text.replace(prefix, "").trim();

  // Quotes around the whole thing, straight or typographic. Only stripped when they wrap the
  // entire string: a quote *inside* the sentence is content.
  const QUOTE_PAIRS: [string, string][] = [['"', '"'], ["'", "'"], ["«", "»"], ["“", "”"]];
  for (const [open, close] of QUOTE_PAIRS) {
    if (text.startsWith(open) && text.endsWith(close) && text.length > 2) {
      text = text.slice(open.length, -close.length).trim();
    }
  }

  return text.replace(/\s{2,}/g, " ").trim();
}

export type ProposalCheck = {
  value: string;
  length: number;
  /** Blocks accepting. */
  errors: string[];
  /** Worth saying, does not block. */
  warnings: string[];
  /** The model said it could not do it. */
  declined: boolean;
};

export function checkProposal(
  raw: unknown,
  limits: { min: number; ideal: number; max: number }
): ProposalCheck {
  const value = cleanProposal(raw);

  /*
   * The refusal sentinel, punctuation and all.
   *
   * Told to answer exactly «NO_SE_PUEDE», a model answers «NO_SE_PUEDE.» — and an exact match
   * then treats the sentinel as a twelve-character description and offers to save it. Seen on the
   * first real call.
   */
  if (/^["'«“]?\s*NO[_\s-]?SE[_\s-]?PUEDE\s*[.!…]?["'»”]?$/i.test(value)) {
    return {
      value: "",
      length: 0,
      errors: [],
      warnings: [],
      declined: true,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!value) errors.push("El modelo no ha devuelto nada.");
  if (value.length > limits.max) {
    errors.push(`${value.length} caracteres, y el máximo es ${limits.max}. Acórtalo o regenera.`);
  }
  if (value && value.length < limits.min) {
    warnings.push(`Sólo ${value.length} caracteres: se queda corto para decir algo útil.`);
  } else if (value.length > limits.ideal && value.length <= limits.max) {
    warnings.push(`${value.length} caracteres: puede salir cortado en Google.`);
  }

  for (const opening of BANNED_OPENINGS) {
    if (opening.test(value)) {
      warnings.push("Empieza con una fórmula de relleno. Vale la pena regenerar.");
      break;
    }
  }

  // A model that repeats the instruction back is a prompt problem, not a content problem, and
  // saving it would put the instruction on the page.
  if (/responde\s+únicamente|^no\s+puedo\b/i.test(value)) {
    errors.push("La respuesta parece una instrucción, no una descripción. Regenera.");
  }

  return { value, length: value.length, errors, warnings, declined: false };
}

/**
 * The visible text of a page, for the prompt.
 *
 * Walks stored fields and collects strings, stripping tags. Deliberately crude: the point is to
 * give the model enough to know what the page is about, not to reconstruct it.
 */
export function extractPageText(fields: unknown, depth = 0): string {
  if (depth > 8) return "";

  if (typeof fields === "string") {
    const text = fields
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Skip anything that is plainly not prose: a URL, an id, a single word setting.
    if (!text || text.length < 12) return "";
    if (/^https?:\/\//.test(text)) return "";
    if (/^(node|media|sec|ct)_[a-z0-9]+$/i.test(text)) return "";
    return text;
  }

  if (Array.isArray(fields)) {
    return fields.map((item) => extractPageText(item, depth + 1)).filter(Boolean).join(" · ");
  }

  if (fields && typeof fields === "object") {
    return Object.values(fields as Record<string, unknown>)
      .map((item) => extractPageText(item, depth + 1))
      .filter(Boolean)
      .join(" · ");
  }

  return "";
}
