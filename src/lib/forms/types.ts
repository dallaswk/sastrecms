/**
 * The contact form's own field vocabulary.
 *
 * Deliberately narrower than FIELD_TYPES: a visitor filling in a form is not an editor, so
 * there is no richtext, no media picker and no relation. What is here is what a pyme asks
 * for — and each type carries a real HTML input type, which is what makes the form usable
 * on a phone keyboard.
 */
export const FORM_FIELD_TYPES = ["text", "email", "tel", "textarea", "select", "checkbox"] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_FIELD_LABELS: Record<FormFieldType, string> = {
  text: "Texto",
  email: "Correo electrónico",
  tel: "Teléfono",
  textarea: "Texto largo",
  select: "Desplegable",
  checkbox: "Casilla",
};

/** The input type attribute for each, so the phone keyboard matches the field. */
export const FORM_INPUT_TYPES: Record<FormFieldType, string> = {
  text: "text",
  email: "email",
  tel: "tel",
  textarea: "textarea",
  select: "select",
  checkbox: "checkbox",
};

/** One field, as declared in the section's configuration. */
export type FormField = {
  /** Stable within the form. Used as the input name and as the key in stored `values`. */
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  /** For `select`, one option per line in the editor. */
  options?: string[];
};

export type SubmissionValues = Record<string, string>;

export type ValidationIssue = { key: string; message: string };

/** The two hard caps, applied per field and per submission. */
export const MAX_FIELD_LENGTH = 5000;
export const MAX_FIELDS = 30;

/**
 * The honeypot's input name.
 *
 * Plausible enough that a bot filling every field will fill it, and hidden from people with
 * CSS *and* `tabindex="-1"` *and* `aria-hidden` — a screen reader user tabbing into an
 * invisible field and typing in it would otherwise have their message silently dropped.
 */
export const HONEYPOT_FIELD = "empresa_url";

/** Rate limit: per IP, and per site so a distributed flood cannot fill the table. */
export const RATE_LIMIT = {
  perIp: { max: 5, windowMinutes: 10 },
  perSite: { max: 100, windowMinutes: 60 },
} as const;
