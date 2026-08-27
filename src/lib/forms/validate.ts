import {
  FIELD_PATTERNS,
  FORM_FIELD_TYPES,
  HONEYPOT_FIELD,
  MAX_FIELD_LENGTH,
  MAX_FIELDS,
  PATTERN_NAMES,
  TYPES_WITH_LENGTH,
  TYPES_WITH_OPTIONS,
  TYPES_WITH_RANGE,
  type FormField,
  type FormFieldType,
  type FormValidation,
  type PatternName,
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
/** Same rule the editor enforces, so what it accepts and what this accepts are one thing. */
const VALID_KEY = /^[a-z][a-z0-9_]*$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

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
    // Shape enforced here, not only in the editor. Two reasons: the editor warns about a
    // malformed key and that warning has to be true, and `values[key] = …` on a plain
    // object with the key `__proto__` sets the prototype instead of storing the answer —
    // the value is lost and the object stops behaving like a record.
    if (!VALID_KEY.test(key) || FORBIDDEN_KEYS.has(key)) continue;
    // A duplicate key would make one field silently overwrite the other in `values`.
    if (seen.has(key) || key === HONEYPOT_FIELD) continue;

    const type = FORM_FIELD_TYPES.includes(row.type as FormFieldType)
      ? (row.type as FormFieldType)
      : "text";

    const options = TYPES_WITH_OPTIONS.includes(type) ? parseOptions(row.options) : undefined;
    // A select with no options cannot be filled in, so it is not offered at all.
    if (TYPES_WITH_OPTIONS.includes(type) && !options?.length) continue;

    seen.add(key);
    fields.push({
      key,
      label,
      type,
      ...(isTruthy(row.required) ? { required: true } : {}),
      ...(str(row.placeholder) ? { placeholder: str(row.placeholder) } : {}),
      ...(str(row.help) ? { help: str(row.help) } : {}),
      ...(options ? { options } : {}),
      ...(row.width === "half" ? { width: "half" as const } : {}),
      ...withValidation(type, row),
    });

    if (fields.length >= MAX_FIELDS) break;
  }

  return fields;
}

function str(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * The editor stores booleans as a "no"/"sí" select, so a plain truthy check reads "no" as
 * yes — every optional field would become mandatory and the visitor could not submit.
 */
function isTruthy(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return value === "sí" || value === "si" || value === "true" || value === "1";
}

/** The editor writes one option per line in a textarea; a preset may write an array. */
function parseOptions(raw: unknown): string[] | undefined {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r?\n/) : [];
  const options = list
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.trim())
    .filter((o) => o !== "");
  return options.length ? [...new Set(options)] : undefined;
}

function num(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * The validation rules, filtered by what the type can actually enforce.
 *
 * A length rule on a date, or a range on a textarea, is a rule that never fires — and a
 * rule that never fires is worse than no rule, because the editor thinks it is protected.
 */
function withValidation(
  type: FormFieldType,
  row: Record<string, unknown>
): { validation?: FormValidation } {
  const validation: FormValidation = {};

  if (TYPES_WITH_LENGTH.includes(type)) {
    const minLength = num(row.minLength);
    const maxLength = num(row.maxLength);
    if (minLength !== undefined && minLength > 0) validation.minLength = minLength;
    if (maxLength !== undefined && maxLength > 0) validation.maxLength = maxLength;
    // Swapped bounds would reject everything. Dropping the pair is safer than guessing.
    if (
      validation.minLength !== undefined &&
      validation.maxLength !== undefined &&
      validation.minLength > validation.maxLength
    ) {
      delete validation.minLength;
      delete validation.maxLength;
    }
  }

  if (TYPES_WITH_RANGE.includes(type)) {
    if (type === "number") {
      const min = num(row.min);
      const max = num(row.max);
      if (min !== undefined) validation.min = min;
      if (max !== undefined) validation.max = max;
      if (validation.min !== undefined && validation.max !== undefined && validation.min > validation.max) {
        delete validation.min;
        delete validation.max;
      }
    } else {
      const min = str(row.min);
      const max = str(row.max);
      if (ISO_DATE.test(min)) validation.min = min;
      if (ISO_DATE.test(max)) validation.max = max;
      if (validation.min && validation.max && String(validation.min) > String(validation.max)) {
        delete validation.min;
        delete validation.max;
      }
    }
  }

  const pattern = str(row.pattern);
  if (PATTERN_NAMES.includes(pattern as PatternName)) {
    validation.pattern = pattern as PatternName;
  }

  const message = str(row.message);
  if (message) validation.message = message;

  return Object.keys(validation).length ? { validation } : {};
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
// Deliberately loose: +34, spaces, dots, parens and dashes are all how people write a
// phone number, and rejecting a real number to enforce a format loses the lead.
const TEL = /^[\d\s+().-]{6,25}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const CIF_CONTROL_LETTERS = "JABCDEFGHI";

/**
 * The check digit, which is the part that catches a mistyped number — a shape-only regex
 * accepts 12345678A as readily as the real thing.
 */
export function isValidNif(raw: string): boolean {
  const value = raw.trim().toUpperCase().replace(/[\s-]/g, "");

  // DNI: 8 digits + letter.
  const dni = /^(\d{8})([A-Z])$/.exec(value);
  if (dni) return DNI_LETTERS[Number(dni[1]) % 23] === dni[2];

  // NIE: X/Y/Z stand in for a leading 0/1/2, then the DNI rule.
  const nie = /^([XYZ])(\d{7})([A-Z])$/.exec(value);
  if (nie) {
    const prefix = "XYZ".indexOf(nie[1]);
    return DNI_LETTERS[Number(`${prefix}${nie[2]}`) % 23] === nie[3];
  }

  // CIF: organisation letter, 7 digits, control that is a digit or a letter. Which of the
  // two an organisation uses depends on its legal class, so both are accepted — the point
  // here is catching a typo, not classifying the company.
  const cif = /^([A-HJ-NP-SUVW])(\d{7})([0-9A-J])$/.exec(value);
  if (cif) {
    const digits = cif[2].split("").map(Number);
    let total = 0;
    for (const [index, digit] of digits.entries()) {
      if (index % 2 === 0) {
        const doubled = digit * 2;
        total += doubled > 9 ? doubled - 9 : doubled;
      } else {
        total += digit;
      }
    }
    const control = (10 - (total % 10)) % 10;
    return cif[3] === String(control) || cif[3] === CIF_CONTROL_LETTERS[control];
  }

  return false;
}

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
    // The editor's own message wins over every built-in one: the site owner knows their
    // visitors better than this file does.
    const custom = field.validation?.message;
    const fail = (message: string) => issues.push({ key: field.key, message: custom || message });

    if (field.type === "checkbox") {
      const checked = rawValue === true || rawValue === "on" || rawValue === "true";
      if (field.required && !checked) fail(`Debes marcar «${field.label}»`);
      values[field.key] = checked ? "sí" : "no";
      continue;
    }

    const value = typeof rawValue === "string" ? rawValue.trim() : "";

    if (!value) {
      if (field.required) fail(`${field.label} es obligatorio`);
      continue;
    }

    // The hard cap comes before the configured one: it is what stops a 5 MB body, and it
    // applies whether or not the owner set a maxLength.
    if (value.length > MAX_FIELD_LENGTH) {
      fail(`${field.label} es demasiado largo`);
      continue;
    }

    const typeIssue = checkType(field, value);
    if (typeIssue) {
      fail(typeIssue);
      continue;
    }

    const ruleIssue = checkRules(field, value);
    if (ruleIssue) {
      fail(ruleIssue);
      continue;
    }

    values[field.key] = value;
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, values };
}

/** What the type itself demands, regardless of configuration. */
function checkType(field: FormField, value: string): string | null {
  switch (field.type) {
    case "email":
      return EMAIL.test(value) ? null : "Revisa el correo electrónico";
    case "tel":
      return TEL.test(value) ? null : "Revisa el teléfono";
    case "url":
      return isHttpUrl(value) ? null : "La dirección debe empezar por http:// o https://";
    case "number":
      return Number.isFinite(Number(value)) ? null : `${field.label} debe ser un número`;
    case "date":
      return ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))
        ? null
        : `${field.label} debe ser una fecha`;
    case "select":
    case "radio":
      return field.options?.includes(value) ? null : `Elige una opción de ${field.label}`;
    default:
      return null;
  }
}

/** What the editor configured on top. */
function checkRules(field: FormField, value: string): string | null {
  const rules = field.validation;
  if (!rules) return null;

  if (rules.minLength !== undefined && value.length < rules.minLength) {
    return `${field.label} debe tener al menos ${rules.minLength} caracteres`;
  }
  if (rules.maxLength !== undefined && value.length > rules.maxLength) {
    return `${field.label} no puede pasar de ${rules.maxLength} caracteres`;
  }

  if (field.type === "number") {
    const parsed = Number(value);
    if (typeof rules.min === "number" && parsed < rules.min) {
      return `${field.label} no puede ser menor que ${rules.min}`;
    }
    if (typeof rules.max === "number" && parsed > rules.max) {
      return `${field.label} no puede ser mayor que ${rules.max}`;
    }
  }

  if (field.type === "date") {
    // ISO dates compare correctly as strings, which avoids a timezone shifting a boundary.
    if (typeof rules.min === "string" && value < rules.min) {
      return `${field.label} no puede ser antes de ${rules.min}`;
    }
    if (typeof rules.max === "string" && value > rules.max) {
      return `${field.label} no puede ser después de ${rules.max}`;
    }
  }

  if (rules.pattern) {
    const pattern = FIELD_PATTERNS[rules.pattern];
    if (!pattern.regex.test(value)) return pattern.message;
    // The shape passed; now the part a regex cannot do.
    if (rules.pattern === "nif" && !isValidNif(value)) return "El DNI, NIE o CIF no es válido";
  }

  return null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
