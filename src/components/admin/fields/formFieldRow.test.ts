import { describe, it, expect } from "vitest";
import {
  capabilitiesOf,
  emptyRow,
  formProblems,
  fromRow,
  keyFromLabel,
  problemsOf,
  toRow,
  type FormFieldRow,
} from "./formFieldRow";
import { parseFormFields } from "@lib/forms/validate";
import { FORM_FIELD_TYPES } from "@lib/forms/types";

const row = (over: Partial<FormFieldRow> = {}): FormFieldRow => ({ ...emptyRow("l1"), ...over });

describe("keyFromLabel", () => {
  it("quita acentos y espacios", () => {
    expect(keyFromLabel("Código postal")).toBe("codigo_postal");
    expect(keyFromLabel("¿Cuántos m²?")).toBe("cuantos_m");
    expect(keyFromLabel("  Nombre y apellidos  ")).toBe("nombre_y_apellidos");
  });

  it("nunca deja guiones bajos sueltos en los extremos", () => {
    expect(keyFromLabel("---hola---")).toBe("hola");
    expect(keyFromLabel("!!!")).toBe("");
  });
});

describe("toRow / fromRow", () => {
  it("da la vuelta a lo que guarda el editor sin perder nada", () => {
    const original = row({
      key: "nif", label: "NIF", type: "text", required: "sí", width: "half",
      placeholder: "12345678Z", help: "Para la factura", pattern: "nif",
      minLength: "9", maxLength: "9", message: "Revisa el NIF",
    });
    expect(toRow(fromRow(original), "l2")).toEqual({ ...original, _lid: "l2" });
  });

  it("lee las opciones tanto como array (preset) como por líneas (editor)", () => {
    expect(toRow({ key: "o", label: "O", type: "select", options: ["A", "B"] }, "l").options).toBe("A\nB");
    expect(toRow({ key: "o", label: "O", type: "select", options: "A\nB" }, "l").options).toBe("A\nB");
  });

  it("lee la validación esté anidada o plana", () => {
    const nested = toRow({ key: "c", label: "C", type: "text", validation: { minLength: 5, pattern: "nif" } }, "l");
    expect(nested.minLength).toBe("5");
    expect(nested.pattern).toBe("nif");
  });

  it("un tipo inventado cae a texto, igual que en el servidor", () => {
    expect(toRow({ key: "x", label: "X", type: "richtext" }, "l").type).toBe("text");
  });

  it("no lanza con basura", () => {
    expect(toRow(null, "l").type).toBe("text");
    expect(toRow("nope", "l").key).toBe("");
  });

  it("descarta las reglas que el tipo nuevo no puede aplicar", () => {
    // Un campo de texto con longitud, cambiado a fecha: la longitud no debe sobrevivir.
    const stored = fromRow(row({ key: "f", label: "F", type: "date", minLength: "5", min: "2026-01-01" }));
    expect("minLength" in stored).toBe(false);
    expect(stored.min).toBe("2026-01-01");
  });
});

/**
 * El puente entre el editor y el servidor.
 *
 * `parseFormFields` decide qué acepta el endpoint público y qué se pinta en la página. Todo
 * lo que el editor guarde y el parser descarte es un campo que parece configurado en el
 * backoffice y simplemente no existe en la web.
 */
describe("editor ↔ servidor", () => {
  it("lo que el editor guarda como válido, el servidor lo acepta", () => {
    const rows = [
      row({ key: "nombre", label: "Nombre", type: "text", required: "sí", width: "half" }),
      row({ key: "email", label: "Correo", type: "email", required: "sí" }),
      row({ key: "via", label: "Vía", type: "radio", options: "Teléfono\nCorreo" }),
      row({ key: "m2", label: "Metros", type: "number", min: "10", max: "500" }),
      row({ key: "cita", label: "Cita", type: "date", min: "2026-09-01" }),
      row({ key: "nif", label: "NIF", type: "text", pattern: "nif" }),
    ];
    for (const r of rows) expect(problemsOf(r, rows), r.key).toEqual([]);

    const parsed = parseFormFields(rows.map(fromRow));
    expect(parsed).toHaveLength(rows.length);
    expect(parsed.map((f) => f.key)).toEqual(rows.map((r) => r.key));
    expect(parsed[0].width).toBe("half");
    expect(parsed[2].options).toEqual(["Teléfono", "Correo"]);
    expect(parsed[3].validation).toEqual({ min: 10, max: 500 });
    expect(parsed[5].validation?.pattern).toBe("nif");
  });

  it("y al contrario: todo lo que el servidor descarta, el editor lo avisa", () => {
    const cases: [string, FormFieldRow][] = [
      ["sin etiqueta", row({ key: "x", label: "" })],
      ["sin clave", row({ key: "", label: "X" })],
      ["clave con mayúsculas", row({ key: "Nombre", label: "Nombre" })],
      ["clave con guiones", row({ key: "mi-campo", label: "X" })],
      ["clave del honeypot", row({ key: "empresa_url", label: "Web" })],
      ["desplegable sin opciones", row({ key: "o", label: "O", type: "select" })],
      ["clave __proto__", row({ key: "__proto__", label: "X" })],
    ];

    for (const [name, bad] of cases) {
      expect(problemsOf(bad, [bad]), `${name}: el editor no avisa`).not.toEqual([]);
      expect(parseFormFields([fromRow(bad)]), `${name}: el servidor sí lo acepta`).toEqual([]);
    }
  });

  it("avisa de la clave repetida, que en el servidor haría desaparecer un campo", () => {
    const a = row({ key: "email", label: "Correo", type: "email" });
    const b = row({ key: "email", label: "Otro correo", type: "email" });
    expect(problemsOf(a, [a, b])[0]).toContain("repetida");
    expect(parseFormFields([fromRow(a), fromRow(b)])).toHaveLength(1);
  });

  it("cada tipo declara al menos una capacidad coherente", () => {
    for (const type of FORM_FIELD_TYPES) {
      const caps = capabilitiesOf(type);
      // Ni un tipo con opciones tiene longitud, ni uno con rango tiene opciones: si algún
      // día se solapan, el editor mostraría reglas que el servidor no aplica.
      if (caps.options) expect(caps.length, type).toBe(false);
      if (caps.range) expect(caps.options, type).toBe(false);
    }
  });
});

describe("formProblems", () => {
  it("un formulario vacío no se pinta, y lo dice", () => {
    expect(formProblems([])[0]).toContain("no tiene campos");
  });

  it("sin campo de correo avisa de que no se podrá responder", () => {
    const rows = [row({ key: "nombre", label: "Nombre", type: "text" })];
    expect(formProblems(rows)[0]).toContain("correo");
  });

  it("con correo no se queja", () => {
    const rows = [row({ key: "email", label: "Correo", type: "email" })];
    expect(formProblems(rows)).toEqual([]);
  });
});
