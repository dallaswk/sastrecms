import {
  FORM_FIELD_LABELS,
  FORM_FIELD_TYPES,
  TYPES_WITH_LENGTH,
  TYPES_WITH_OPTIONS,
  TYPES_WITH_RANGE,
  type FormFieldType,
} from "@lib/forms/types";

/**
 * The editor's own shape for one form field.
 *
 * Flat and all-strings, unlike the validated `FormField`: this is what sits in a set of
 * inputs. `parseFormFields` on the server is what turns it into the real thing, and it is
 * the same function the public form uses to decide what to render — so anything this
 * produces that the parser drops is a field that silently disappears. `problemsOf` below
 * exists to say that out loud in the editor instead.
 */
export type FormFieldRow = {
  _lid: string;
  key: string;
  label: string;
  type: FormFieldType;
  required: string;
  width: string;
  placeholder: string;
  help: string;
  options: string;
  minLength: string;
  maxLength: string;
  min: string;
  max: string;
  pattern: string;
  message: string;
};

export const TYPE_OPTIONS = FORM_FIELD_TYPES.map((type) => ({
  value: type,
  label: FORM_FIELD_LABELS[type],
}));

export function emptyRow(lid: string): FormFieldRow {
  return {
    _lid: lid,
    key: "",
    label: "",
    type: "text",
    required: "no",
    width: "full",
    placeholder: "",
    help: "",
    options: "",
    minLength: "",
    maxLength: "",
    min: "",
    max: "",
    pattern: "",
    message: "",
  };
}

/** Whatever is stored — written by the editor, a preset or an agent — read as a row. */
export function toRow(raw: unknown, lid: string): FormFieldRow {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const validation = (row.validation && typeof row.validation === "object"
    ? row.validation
    : {}) as Record<string, unknown>;

  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = row[key] ?? validation[key];
      if (typeof value === "string" && value.trim()) return value;
      if (typeof value === "number") return String(value);
    }
    return "";
  };

  const type = FORM_FIELD_TYPES.includes(row.type as FormFieldType)
    ? (row.type as FormFieldType)
    : "text";

  return {
    _lid: lid,
    key: pick("key"),
    label: pick("label"),
    type,
    required: truthy(row.required) ? "sí" : "no",
    width: row.width === "half" ? "half" : "full",
    placeholder: pick("placeholder"),
    help: pick("help"),
    // Stored as an array by presets, as lines by the editor. Shown as lines either way.
    options: Array.isArray(row.options)
      ? row.options.filter((o): o is string => typeof o === "string").join("\n")
      : pick("options"),
    minLength: pick("minLength"),
    maxLength: pick("maxLength"),
    min: pick("min"),
    max: pick("max"),
    pattern: pick("pattern"),
    message: pick("message"),
  };
}

function truthy(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return value === "sí" || value === "si" || value === "true" || value === "1";
}

/**
 * A row back to what gets stored.
 *
 * Rules the type cannot enforce are dropped rather than kept: leaving a length rule on a
 * date field would mean the editor shows a constraint the server ignores.
 */
export function fromRow(row: FormFieldRow): Record<string, unknown> {
  const out: Record<string, unknown> = {
    key: row.key.trim(),
    label: row.label.trim(),
    type: row.type,
  };

  if (row.required === "sí") out.required = "sí";
  if (row.width === "half") out.width = "half";
  if (row.placeholder.trim()) out.placeholder = row.placeholder.trim();
  if (row.help.trim()) out.help = row.help.trim();
  if (TYPES_WITH_OPTIONS.includes(row.type) && row.options.trim()) out.options = row.options;

  if (TYPES_WITH_LENGTH.includes(row.type)) {
    if (row.minLength.trim()) out.minLength = row.minLength.trim();
    if (row.maxLength.trim()) out.maxLength = row.maxLength.trim();
  }
  if (TYPES_WITH_RANGE.includes(row.type)) {
    if (row.min.trim()) out.min = row.min.trim();
    if (row.max.trim()) out.max = row.max.trim();
  }
  if (row.pattern.trim()) out.pattern = row.pattern.trim();
  if (row.message.trim()) out.message = row.message.trim();

  return out;
}

/** Which rule groups this type can actually enforce, so the editor hides the rest. */
export function capabilitiesOf(type: FormFieldType) {
  return {
    options: TYPES_WITH_OPTIONS.includes(type),
    length: TYPES_WITH_LENGTH.includes(type),
    range: TYPES_WITH_RANGE.includes(type),
    // A pattern on a number or a date is meaningless; on a checkbox there is no text.
    pattern: ["text", "tel"].includes(type),
    placeholder: !["checkbox", "select", "radio", "date"].includes(type),
  };
}

/** Turns a label into a usable key. Only ever offered for a field that has none yet. */
export function keyFromLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * Everything wrong with one row, in the editor's words.
 *
 * This is the mirror of what `parseFormFields` drops. Without it the failure mode is a
 * field that looks configured in the backoffice and is simply absent from the live form.
 */
export function problemsOf(row: FormFieldRow, all: FormFieldRow[]): string[] {
  const problems: string[] = [];

  if (!row.label.trim()) problems.push("Sin etiqueta el campo no se muestra.");
  if (!row.key.trim()) problems.push("Sin clave el campo no se guarda.");
  else if (!/^[a-z][a-z0-9_]*$/.test(row.key.trim())) {
    problems.push("La clave admite minúsculas, números y guiones bajos, y empieza por letra.");
  }

  const key = row.key.trim();
  if (key && all.filter((other) => other.key.trim() === key).length > 1) {
    problems.push("Esta clave está repetida: una de las dos respuestas pisaría a la otra.");
  }
  if (key === "empresa_url") {
    problems.push("Esa clave la usa el campo trampa anti-spam. Elige otra.");
  }
  // Como clave de un objeto en JavaScript, cualquiera de estas no guarda el valor: lo que
  // hace es tocar el prototipo. El servidor las descarta, así que aquí también se avisa.
  if (["__proto__", "constructor", "prototype"].includes(key)) {
    problems.push("Esa clave está reservada por el lenguaje y no guardaría la respuesta.");
  }

  const caps = capabilitiesOf(row.type);
  if (caps.options && !row.options.split(/\r?\n/).some((o) => o.trim())) {
    problems.push("Sin opciones no se puede rellenar, así que el campo no aparecerá.");
  }

  const asNumber = (value: string) => (value.trim() ? Number(value) : undefined);
  if (caps.length) {
    const min = asNumber(row.minLength);
    const max = asNumber(row.maxLength);
    if (min !== undefined && max !== undefined && min > max) {
      problems.push("El mínimo es mayor que el máximo: no se podría enviar nada.");
    }
  }
  if (caps.range && row.type === "number") {
    const min = asNumber(row.min);
    const max = asNumber(row.max);
    if (min !== undefined && max !== undefined && min > max) {
      problems.push("El mínimo es mayor que el máximo.");
    }
  }
  if (caps.range && row.type === "date" && row.min.trim() && row.max.trim() && row.min > row.max) {
    problems.push("La fecha mínima es posterior a la máxima.");
  }

  return problems;
}

/** What is wrong with the form as a whole, rather than with one field. */
export function formProblems(rows: FormFieldRow[]): string[] {
  const problems: string[] = [];
  if (!rows.length) {
    problems.push("El formulario no tiene campos, así que no se pintará en la página.");
    return problems;
  }
  if (!rows.some((row) => row.type === "email")) {
    problems.push(
      "Ningún campo pide un correo, así que el aviso no llevará a quién responder y no podrás " +
        "contestar desde el correo."
    );
  }
  return problems;
}
