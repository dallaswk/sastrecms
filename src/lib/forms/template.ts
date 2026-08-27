import { escapeHtml } from "@lib/email";
import type { FormField, SubmissionValues } from "./types";

/**
 * The email templates the site owner writes.
 *
 * Placeholders are `{{clave}}` — the field's own key — plus a few built-ins. Deliberately
 * not a template language: no conditionals, no loops, no expressions. Anything with a
 * grammar is something to debug in a text field with no error reporting, and the one loop
 * anybody actually wants (every answer, in order) is `{{_respuestas}}`.
 */

export type TemplateContext = {
  fields: FormField[];
  values: SubmissionValues;
  siteName: string;
  pageTitle: string;
  pageUrl: string;
  /** Formatted by the caller: this module never reads the clock. */
  date: string;
};

export const BUILTIN_PLACEHOLDERS = {
  _respuestas: "Todas las respuestas, con su etiqueta",
  _sitio: "Nombre del sitio",
  _pagina: "Título de la página",
  _url: "Dirección de la página",
  _fecha: "Fecha y hora del envío",
} as const;

/** What the editor offers as insertable placeholders, for this form's own fields. */
export function availablePlaceholders(fields: FormField[]): { token: string; label: string }[] {
  return [
    ...fields.map((field) => ({ token: `{{${field.key}}}`, label: field.label })),
    ...Object.entries(BUILTIN_PLACEHOLDERS).map(([token, label]) => ({
      token: `{{${token}}}`,
      label,
    })),
  ];
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;

/**
 * Substitutes placeholders.
 *
 * `mode` decides escaping, and it is not optional on purpose: the same template string is
 * rendered twice, once into HTML and once into plain text, and getting it wrong in the HTML
 * pass is a stored XSS in an email a person opens.
 *
 * An unknown placeholder is left as written rather than blanked, so a typo is visible in
 * the test email instead of quietly producing "Hola ,".
 */
export function renderTemplate(
  template: string,
  context: TemplateContext,
  mode: "html" | "text"
): string {
  return template.replace(PLACEHOLDER, (whole, key: string) => {
    const value = resolve(key, context, mode);
    if (value === null) return whole;
    return mode === "html" && key !== "_respuestas" ? escapeHtml(value) : value;
  });
}

function resolve(key: string, context: TemplateContext, mode: "html" | "text"): string | null {
  switch (key) {
    case "_respuestas":
      return mode === "html" ? answersHtml(context) : answersText(context);
    case "_sitio":
      return context.siteName;
    case "_pagina":
      return context.pageTitle;
    case "_url":
      return context.pageUrl;
    case "_fecha":
      return context.date;
    default: {
      const field = context.fields.find((f) => f.key === key);
      if (!field) return null;
      return context.values[field.key] ?? "";
    }
  }
}

/** Every answered field as a table. Inline styles, because email clients drop stylesheets. */
export function answersHtml(context: TemplateContext): string {
  const rows = context.fields
    .filter((field) => context.values[field.key])
    .map(
      (field) =>
        `<tr>` +
        `<th align="left" style="padding:4px 16px 4px 0;vertical-align:top;white-space:nowrap">${escapeHtml(field.label)}</th>` +
        `<td style="padding:4px 0">${escapeHtml(context.values[field.key]).replace(/\n/g, "<br/>")}</td>` +
        `</tr>`
    )
    .join("");

  return rows
    ? `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows}</table>`
    : "";
}

export function answersText(context: TemplateContext): string {
  return context.fields
    .filter((field) => context.values[field.key])
    .map((field) => `${field.label}: ${context.values[field.key]}`)
    .join("\n");
}

/**
 * Turns the editor's plain-text body into HTML.
 *
 * Blank lines become paragraphs, single newlines become breaks — what someone typing into a
 * textarea expects. The `{{_respuestas}}` table is already HTML by the time it gets here, so
 * it is substituted after this rather than before, and this only ever escapes plain text.
 */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => {
      // A paragraph that is only the answers table must not be wrapped in <p>: a <table>
      // inside a <p> is invalid, and some clients close the paragraph early and reflow the
      // rest of the email around it.
      if (/^\s*\{\{\s*_respuestas\s*\}\}\s*$/.test(block)) return block.trim();
      return `<p>${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");
}

/**
 * The complete body, from the editor's template to sendable HTML and text.
 *
 * Order matters: the plain text is turned into HTML *first*, escaping the owner's own
 * typing, and only then are placeholders substituted — so the answers table survives as
 * markup while everything a visitor wrote is still escaped by renderTemplate.
 */
export function renderBody(
  template: string,
  context: TemplateContext
): { html: string; text: string } {
  return {
    html: renderTemplate(textToHtml(template), context, "html"),
    text: renderTemplate(template, context, "text"),
  };
}

/** Subject lines are one line, and a newline in a header is a header injection. */
export function renderSubject(template: string, context: TemplateContext): string {
  return renderTemplate(template, context, "text").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
}
