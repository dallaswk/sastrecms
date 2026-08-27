import {
  FORM_FIELD_TYPES,
  HONEYPOT_FIELD,
  MAX_FIELD_LENGTH,
  MAX_FIELDS,
  type FormField,
  type FormFieldType,
  type SubmissionValues,
  type ValidationIssue,
} from "./types";

/**
 * Reading a form's fields out of a section's stored data.
 *
 * The submit endpoint is public, so what a visitor may send is decided *here*, from the
 * form the site owner actually configured — never from the request. Otherwise the endpoint
 * is a free-form database anyone can write to.
 */
export function parseFormFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];

  const fields: FormField[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const key = typeof row.key === "string" ? row.key.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!key || !label) continue;
    // A duplicate key would make one field silently overwrite the other in `values`.
    if (seen.has(key) || key === HONEYPOT_FIELD) continue;

    const type = FORM_FIELD_TYPES.includes(row.type as FormFieldType)
      ? (row.type as FormFieldType)
      : "text";

    const options = type === "select" ? parseOptions(row.options) : undefined;

    // A select with no options cannot be filled in, so it is not offered at all.
    if (type === "select" && !options?.length) continue;

    seen.add(key);
    fields.push({
      key,
      label,
      type,
      ...(isRequired(row.required) ? { required: true } : {}),
      ...(typeof row.placeholder === "string" && row.placeholder ? { placeholder: row.placeholder } : {}),
      ...(options ? { options } : {}),
    });

    if (fields.length >= MAX_FIELDS) break;
  }

  return fields;
}

/**
 * The editor stores this as a "no"/"sí" select, so a plain truthy check reads "no" as yes —
 * every optional field would become mandatory and the visitor could not submit.
 */
function isRequired(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return value === "sí" || value === "si" || value === "true" || value === "1";
}

/** The editor writes one option per line in a textarea; a preset may write an array. */
function parseOptions(raw: unknown): string[] | undefined {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/\r?\n/)
      : [];
  const options = list
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.trim())
    .filter((o) => o !== "");
  return options.length ? options : undefined;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
// Deliberately loose: +34, spaces, dots, parens and dashes are all how people write a
// phone number, and rejecting a real number to enforce a format loses the lead.
const TEL = /^[\d\s+().-]{6,25}$/;

export type ValidationResult =
  | { ok: true; values: SubmissionValues }
  | { ok: false; issues: ValidationIssue[] };

/**
 * Checks a submission against the form's declared fields.
 *
 * Anything not declared is dropped rather than rejected: a stale cached page offering a
 * field the owner has since removed should still deliver the visitor's message.
 */
export function validateSubmission(fields: FormField[], input: unknown): ValidationResult {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  const values: SubmissionValues = {};

  for (const field of fields) {
    const rawValue = raw[field.key];

    if (field.type === "checkbox") {
      const checked = rawValue === true || rawValue === "on" || rawValue === "true";
      if (field.required && !checked) {
        issues.push({ key: field.key, message: `Debes marcar «${field.label}»` });
      }
      values[field.key] = checked ? "sí" : "no";
      continue;
    }

    const value = typeof rawValue === "string" ? rawValue.trim() : "";

    if (!value) {
      if (field.required) issues.push({ key: field.key, message: `${field.label} es obligatorio` });
      continue;
    }

    if (value.length > MAX_FIELD_LENGTH) {
      issues.push({ key: field.key, message: `${field.label} es demasiado largo` });
      continue;
    }

    if (field.type === "email" && !EMAIL.test(value)) {
      issues.push({ key: field.key, message: "Revisa el correo electrónico" });
      continue;
    }

    if (field.type === "tel" && !TEL.test(value)) {
      issues.push({ key: field.key, message: "Revisa el teléfono" });
      continue;
    }

    if (field.type === "select" && field.options && !field.options.includes(value)) {
      issues.push({ key: field.key, message: `Elige una opción de ${field.label}` });
      continue;
    }

    values[field.key] = value;
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, values };
}

/**
 * Whose message this is, for the inbox list and for the notification's Reply-To.
 *
 * Guessed from the field types rather than from hardcoded key names, so a form whose fields
 * are called `correo` and `nombre_completo` works with no configuration.
 */
export function identifySender(
  fields: FormField[],
  values: SubmissionValues
): { name?: string; email?: string } {
  const emailField = fields.find((f) => f.type === "email" && values[f.key]);

  const nameField =
    fields.find((f) => f.type === "text" && /nombre|name/i.test(f.key + f.label) && values[f.key]) ??
    // Otherwise the first short text field, which in practice is the name.
    fields.find((f) => f.type === "text" && values[f.key]);

  return {
    ...(nameField ? { name: values[nameField.key] } : {}),
    ...(emailField ? { email: values[emailField.key] } : {}),
  };
}

/** One line for the inbox list: whatever the visitor actually wrote, shortened. */
export function summarise(fields: FormField[], values: SubmissionValues, max = 120): string {
  const longest = fields
    .filter((f) => f.type === "textarea" && values[f.key])
    .map((f) => values[f.key])
    .sort((a, b) => b.length - a.length)[0];

  const text = longest ?? Object.values(values).find((v) => v && v !== "sí" && v !== "no") ?? "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
