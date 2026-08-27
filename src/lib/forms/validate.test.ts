import { describe, it, expect } from "vitest";
import { parseFormFields, validateSubmission, identifySender, summarise, isValidNif } from "./validate";
import { HONEYPOT_FIELD, MAX_FIELDS, MAX_FIELD_LENGTH } from "./types";

const fields = parseFormFields([
  { key: "nombre", label: "Nombre", type: "text", required: "sí" },
  { key: "email", label: "Correo", type: "email", required: "sí" },
  { key: "telefono", label: "Teléfono", type: "tel" },
  { key: "mensaje", label: "Mensaje", type: "textarea", required: "sí" },
]);

describe("parseFormFields", () => {
  it("lee lo que guarda el editor, con required como select sí/no", () => {
    expect(fields.map((f) => [f.key, f.type, !!f.required])).toEqual([
      ["nombre", "text", true],
      ["email", "email", true],
      ["telefono", "tel", false],
      ["mensaje", "textarea", true],
    ]);
  });

  it('"no" no es obligatorio, aunque sea truthy', () => {
    const [field] = parseFormFields([{ key: "x", label: "X", type: "text", required: "no" }]);
    expect(field.required).toBeUndefined();
  });

  it("convierte las opciones escritas una por línea", () => {
    const [field] = parseFormFields([
      { key: "motivo", label: "Motivo", type: "select", options: "Presupuesto\n Cita \n\nOtro" },
    ]);
    expect(field.options).toEqual(["Presupuesto", "Cita", "Otro"]);
  });

  it("descarta un desplegable sin opciones, que no se podría rellenar", () => {
    expect(parseFormFields([{ key: "m", label: "M", type: "select" }])).toEqual([]);
  });

  it("descarta claves duplicadas, que se pisarían al guardar", () => {
    const parsed = parseFormFields([
      { key: "email", label: "Correo", type: "email" },
      { key: "email", label: "Otro correo", type: "email" },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].label).toBe("Correo");
  });

  it("no deja usar el nombre del honeypot como campo real", () => {
    expect(parseFormFields([{ key: HONEYPOT_FIELD, label: "Web", type: "text" }])).toEqual([]);
  });

  it("un tipo inventado cae a texto en vez de romper el formulario", () => {
    const [field] = parseFormFields([{ key: "x", label: "X", type: "richtext" }]);
    expect(field.type).toBe("text");
  });

  it("tope de campos", () => {
    const many = Array.from({ length: MAX_FIELDS + 10 }, (_, i) => ({
      key: `c${i}`, label: `C${i}`, type: "text",
    }));
    expect(parseFormFields(many)).toHaveLength(MAX_FIELDS);
  });

  it("no lanza con basura", () => {
    expect(parseFormFields(null)).toEqual([]);
    expect(parseFormFields("nope")).toEqual([]);
    expect(parseFormFields([null, 7, { key: "", label: "" }])).toEqual([]);
  });
});

describe("validateSubmission", () => {
  it("acepta un envío completo", () => {
    const result = validateSubmission(fields, {
      nombre: " Ana ",
      email: "ana@ejemplo.es",
      telefono: "+34 600 11 22 33",
      mensaje: "Necesito un presupuesto.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.nombre).toBe("Ana");
  });

  it("nombra cada campo obligatorio que falta", () => {
    const result = validateSubmission(fields, { telefono: "600112233" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.key)).toEqual(["nombre", "email", "mensaje"]);
  });

  it("un campo vacío no obligatorio no se guarda como cadena vacía", () => {
    const result = validateSubmission(fields, {
      nombre: "Ana", email: "ana@ejemplo.es", mensaje: "Hola", telefono: "  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect("telefono" in result.values).toBe(false);
  });

  it("rechaza un correo mal escrito", () => {
    const result = validateSubmission(fields, { nombre: "A", email: "ana@ejemplo", mensaje: "x" });
    expect(result.ok).toBe(false);
  });

  it("acepta los teléfonos como los escribe la gente", () => {
    for (const tel of ["+34 600112233", "600 11 22 33", "(+34) 91-123.45.67"]) {
      const result = validateSubmission(fields, {
        nombre: "A", email: "a@b.es", mensaje: "x", telefono: tel,
      });
      expect(result.ok, tel).toBe(true);
    }
  });

  it("descarta lo que el formulario no declara, en vez de rechazar el envío", () => {
    const result = validateSubmission(fields, {
      nombre: "A", email: "a@b.es", mensaje: "x", is_admin: "true", campo_viejo: "algo",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.values).sort()).toEqual(["email", "mensaje", "nombre"]);
  });

  it("corta un valor absurdamente largo", () => {
    const result = validateSubmission(fields, {
      nombre: "A", email: "a@b.es", mensaje: "x".repeat(MAX_FIELD_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
  });

  it("un select sólo acepta sus propias opciones", () => {
    const [motivo] = parseFormFields([
      { key: "motivo", label: "Motivo", type: "select", options: "Cita\nPresupuesto", required: "sí" },
    ]);
    expect(validateSubmission([motivo], { motivo: "Cita" }).ok).toBe(true);
    expect(validateSubmission([motivo], { motivo: "<script>" }).ok).toBe(false);
  });

  it("una casilla obligatoria sin marcar no pasa", () => {
    const [acepto] = parseFormFields([
      { key: "acepto", label: "Acepto", type: "checkbox", required: "sí" },
    ]);
    expect(validateSubmission([acepto], {}).ok).toBe(false);
    expect(validateSubmission([acepto], { acepto: "on" }).ok).toBe(true);
    const marked = validateSubmission([acepto], { acepto: true });
    if (marked.ok) expect(marked.values.acepto).toBe("sí");
  });
});

describe("identifySender", () => {
  it("encuentra nombre y correo por el tipo, no por la clave", () => {
    const custom = parseFormFields([
      { key: "nombre_completo", label: "Nombre y apellidos", type: "text" },
      { key: "correo", label: "Correo", type: "email" },
    ]);
    const values = { nombre_completo: "Ana Ruiz", correo: "ana@ejemplo.es" };
    expect(identifySender(custom, values)).toEqual({ name: "Ana Ruiz", email: "ana@ejemplo.es" });
  });

  it("sin campo de correo devuelve sólo lo que hay", () => {
    const only = parseFormFields([{ key: "empresa", label: "Empresa", type: "text" }]);
    expect(identifySender(only, { empresa: "ACME" })).toEqual({ name: "ACME" });
  });
});

describe("summarise", () => {
  it("elige el texto largo, que es lo que la persona escribió", () => {
    const values = { nombre: "Ana", email: "a@b.es", mensaje: "Quiero reformar el baño." };
    expect(summarise(fields, values)).toBe("Quiero reformar el baño.");
  });

  it("recorta con puntos suspensivos", () => {
    const values = { mensaje: "x".repeat(200) };
    expect(summarise(fields, values, 20)).toHaveLength(20);
    expect(summarise(fields, values, 20).endsWith("…")).toBe(true);
  });

  it("sin texto largo usa el primer valor útil, no un sí/no", () => {
    const withCheck = parseFormFields([
      { key: "acepto", label: "Acepto", type: "checkbox" },
      { key: "empresa", label: "Empresa", type: "text" },
    ]);
    expect(summarise(withCheck, { acepto: "sí", empresa: "ACME" })).toBe("ACME");
  });
});

describe("isValidNif", () => {
  it("acepta DNI, NIE y CIF reales", () => {
    // Dígitos de control calculados con el algoritmo oficial.
    expect(isValidNif("12345678Z")).toBe(true);
    expect(isValidNif("X1234567L")).toBe(true);
    expect(isValidNif("B12345674")).toBe(true);
  });

  it("caza la errata que un regex de forma no ve", () => {
    expect(isValidNif("12345678A")).toBe(false);
    expect(isValidNif("X1234567A")).toBe(false);
  });

  it("tolera espacios, guiones y minúsculas", () => {
    expect(isValidNif(" 12345678-z ")).toBe(true);
  });

  it("rechaza lo que no tiene forma de identificador", () => {
    for (const value of ["", "1234", "AAAAAAAAA", "123456789"]) {
      expect(isValidNif(value), value).toBe(false);
    }
  });
});

describe("validaciones configuradas", () => {
  const withRules = (extra: Record<string, unknown>) =>
    parseFormFields([{ key: "campo", label: "Campo", type: "text", ...extra }]);

  it("longitud mínima y máxima", () => {
    const fields = withRules({ minLength: "5", maxLength: "10" });
    expect(validateSubmission(fields, { campo: "abc" }).ok).toBe(false);
    expect(validateSubmission(fields, { campo: "abcdef" }).ok).toBe(true);
    expect(validateSubmission(fields, { campo: "a".repeat(11) }).ok).toBe(false);
  });

  it("descarta un par de límites invertido en vez de rechazarlo todo", () => {
    const [field] = withRules({ minLength: "10", maxLength: "5" });
    expect(field.validation?.minLength).toBeUndefined();
    expect(field.validation?.maxLength).toBeUndefined();
  });

  it("no guarda reglas que el tipo no puede aplicar", () => {
    const [date] = parseFormFields([
      { key: "f", label: "F", type: "date", minLength: "5", min: "2026-01-01" },
    ]);
    expect(date.validation?.minLength).toBeUndefined();
    expect(date.validation?.min).toBe("2026-01-01");

    const [text] = parseFormFields([{ key: "t", label: "T", type: "text", min: "3" }]);
    expect(text.validation?.min).toBeUndefined();
  });

  it("rango numérico", () => {
    const fields = parseFormFields([
      { key: "m2", label: "Metros", type: "number", min: "10", max: "500" },
    ]);
    expect(validateSubmission(fields, { m2: "5" }).ok).toBe(false);
    expect(validateSubmission(fields, { m2: "120" }).ok).toBe(true);
    expect(validateSubmission(fields, { m2: "600" }).ok).toBe(false);
    expect(validateSubmission(fields, { m2: "muchos" }).ok).toBe(false);
  });

  it("rango de fechas, comparado como texto ISO para que no lo mueva un huso", () => {
    const fields = parseFormFields([
      { key: "cita", label: "Cita", type: "date", min: "2026-09-01", max: "2026-09-30" },
    ]);
    expect(validateSubmission(fields, { cita: "2026-08-31" }).ok).toBe(false);
    expect(validateSubmission(fields, { cita: "2026-09-15" }).ok).toBe(true);
    expect(validateSubmission(fields, { cita: "2026-10-01" }).ok).toBe(false);
    expect(validateSubmission(fields, { cita: "15/09/2026" }).ok).toBe(false);
  });

  it("formato con nombre, y el dígito de control cuando lo hay", () => {
    const fields = withRules({ pattern: "nif" });
    expect(validateSubmission(fields, { campo: "12345678Z" }).ok).toBe(true);
    // Forma correcta, control incorrecto: sólo lo caza isValidNif.
    const bad = validateSubmission(fields, { campo: "12345678A" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0].message).toContain("no es válido");
  });

  it("código postal y matrícula", () => {
    const cp = withRules({ pattern: "codigo_postal" });
    expect(validateSubmission(cp, { campo: "28001" }).ok).toBe(true);
    expect(validateSubmission(cp, { campo: "99999" }).ok).toBe(false);
    expect(validateSubmission(cp, { campo: "2800" }).ok).toBe(false);

    const mat = withRules({ pattern: "matricula" });
    expect(validateSubmission(mat, { campo: "1234 BCD" }).ok).toBe(true);
    expect(validateSubmission(mat, { campo: "M-1234-AB" }).ok).toBe(true);
  });

  it("ignora un formato inventado en vez de rechazar el campo", () => {
    const [field] = withRules({ pattern: "dni_marciano" });
    expect(field.validation?.pattern).toBeUndefined();
  });

  it("el mensaje propio sustituye a todos los del campo", () => {
    const fields = withRules({ required: "sí", minLength: "5", message: "Pon tu referencia completa" });
    for (const input of [{}, { campo: "ab" }]) {
      const result = validateSubmission(fields, input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues[0].message).toBe("Pon tu referencia completa");
    }
  });
});

describe("tipos nuevos", () => {
  it("radio se valida contra sus opciones, como el desplegable", () => {
    const fields = parseFormFields([
      { key: "via", label: "Vía", type: "radio", options: "Teléfono\nCorreo", required: "sí" },
    ]);
    expect(validateSubmission(fields, { via: "Teléfono" }).ok).toBe(true);
    expect(validateSubmission(fields, { via: "Paloma" }).ok).toBe(false);
  });

  it("url exige http o https, no un javascript:", () => {
    const fields = parseFormFields([{ key: "web", label: "Web", type: "url" }]);
    expect(validateSubmission(fields, { web: "https://ejemplo.es" }).ok).toBe(true);
    expect(validateSubmission(fields, { web: "ejemplo.es" }).ok).toBe(false);
    expect(validateSubmission(fields, { web: "javascript:alert(1)" }).ok).toBe(false);
  });

  it("las opciones repetidas se colapsan", () => {
    const [field] = parseFormFields([
      { key: "o", label: "O", type: "select", options: "A\nB\nA" },
    ]);
    expect(field.options).toEqual(["A", "B"]);
  });
});
