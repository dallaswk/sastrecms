/**
 * The contact form's own field vocabulary and validation rules.
 *
 * Deliberately narrower than FIELD_TYPES: a visitor filling in a form is not an editor, so
 * there is no richtext, no media picker and no relation. What is here is what a pyme asks
 * for — and each type carries a real HTML input type, which is what makes the form usable
 * on a phone keyboard.
 */
export const FORM_FIELD_TYPES = [
  "text",
  "email",
  "tel",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "number",
  "date",
  "url",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_FIELD_LABELS: Record<FormFieldType, string> = {
  text: "Texto",
  email: "Correo electrónico",
  tel: "Teléfono",
  textarea: "Texto largo",
  select: "Desplegable",
  radio: "Opciones (una sola)",
  checkbox: "Casilla",
  number: "Número",
  date: "Fecha",
  url: "Dirección web",
};

/** The `type` attribute for each, so the phone shows the right keyboard. */
export const FORM_INPUT_TYPES: Record<FormFieldType, string> = {
  text: "text",
  email: "email",
  tel: "tel",
  textarea: "textarea",
  select: "select",
  radio: "radio",
  checkbox: "checkbox",
  number: "number",
  date: "date",
  url: "url",
};

/** Which types need a list of options to be usable at all. */
export const TYPES_WITH_OPTIONS: FormFieldType[] = ["select", "radio"];

/** Which types a length rule applies to. */
export const TYPES_WITH_LENGTH: FormFieldType[] = ["text", "textarea", "tel", "url"];

/** Which types a min/max rule applies to. */
export const TYPES_WITH_RANGE: FormFieldType[] = ["number", "date"];

/**
 * Named formats, never a regular expression written by the person editing the form.
 *
 * Two reasons. A site owner cannot be expected to write a correct regex, and a regex they
 * paste from the internet can be catastrophically slow on a crafted input — the endpoint is
 * public, so that would be a denial of service anyone could trigger. Every pattern here is
 * anchored and linear.
 */
export const FIELD_PATTERNS = {
  nif: {
    label: "DNI / NIE / CIF",
    // Shape only. The check digit is verified separately, because the letter is what
    // actually catches a typo and a regex cannot compute it.
    regex: /^([0-9]{8}[A-Za-z]|[XYZxyz][0-9]{7}[A-Za-z]|[A-HJ-NP-SUVWa-hj-np-suvw][0-9]{7}[0-9A-Ja-j])$/,
    message: "Revisa el DNI, NIE o CIF",
    placeholder: "12345678Z",
  },
  codigo_postal: {
    label: "Código postal",
    regex: /^(0[1-9]|[1-4][0-9]|5[0-2])[0-9]{3}$/,
    message: "El código postal debe tener 5 dígitos y empezar por una provincia válida",
    placeholder: "28001",
  },
  iban: {
    label: "IBAN",
    regex: /^[A-Za-z]{2}[0-9]{2}[A-Za-z0-9 ]{11,30}$/,
    message: "Revisa el IBAN",
    placeholder: "ES91 2100 0418 4502 0005 1332",
  },
  matricula: {
    label: "Matrícula",
    regex: /^([0-9]{4}[ -]?[B-DF-HJ-NP-TV-Zb-df-hj-np-tv-z]{3}|[A-Za-z]{1,2}[ -]?[0-9]{4}[ -]?[A-Za-z]{1,2})$/,
    message: "Revisa la matrícula",
    placeholder: "1234 BCD",
  },
  solo_letras: {
    label: "Sólo letras",
    regex: /^[\p{L}\p{M}\s'.-]+$/u,
    message: "Sólo se admiten letras",
    placeholder: "",
  },
} as const;

export type PatternName = keyof typeof FIELD_PATTERNS;

export const PATTERN_NAMES = Object.keys(FIELD_PATTERNS) as PatternName[];

export type FormValidation = {
  minLength?: number;
  maxLength?: number;
  /** For `number` a numeric bound; for `date` an ISO yyyy-mm-dd. */
  min?: number | string;
  max?: number | string;
  pattern?: PatternName;
  /** Replaces the default message for every rule on this field. */
  message?: string;
};

/** One field, as declared in the section's configuration. */
export type FormField = {
  /**
   * Stable within the form. Used as the input name and as the key in stored `values`, so
   * renaming it orphans the answers already in the inbox — the editor says so.
   */
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  /** Shown under the input. The place to explain *why* you are asking for something. */
  help?: string;
  /** For `select` and `radio`. */
  options?: string[];
  /** Layout only: two half-width fields sit side by side on a wide screen. */
  width?: "full" | "half";
  validation?: FormValidation;
};

export type SubmissionValues = Record<string, string>;

export type ValidationIssue = { key: string; message: string };

/** The two hard caps, applied per field and per submission. */
export const MAX_FIELD_LENGTH = 5000;
export const MAX_FIELDS = 30;

/**
 * The honeypot's input name.
 *
 * Plausible enough that a bot filling every field will fill it, and hidden from sight, from
 * the tab order and from screen readers — a screen reader user tabbing into an invisible
 * field and typing in it would otherwise have their message silently dropped.
 */
export const HONEYPOT_FIELD = "empresa_url";

/** Rate limit: per IP, and per site so a distributed flood cannot fill the table. */
export const RATE_LIMIT = {
  perIp: { max: 5, windowMinutes: 10 },
  perSite: { max: 100, windowMinutes: 60 },
} as const;
