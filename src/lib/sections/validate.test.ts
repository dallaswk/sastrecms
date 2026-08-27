import { describe, it, expect } from "vitest";
import { parseSections, coerceSectionData, formatSectionErrors } from "./validate";
import type { FieldDefinition } from "@lib/fields/types";

const heroOk = {
  type: "hero",
  v: 1,
  data: { title: "Hola", subtitle: "Qué tal", cta_label: "", cta_url: "", image: "" },
};

describe("parseSections", () => {
  it("acepta una lista válida y conserva el orden", () => {
    const { sections, errors } = parseSections([
      heroOk,
      { type: "cta", v: 1, data: { title: "T", button_label: "B", button_url: "/x" } },
    ]);
    expect(errors).toEqual([]);
    expect(sections.map((s) => s.type)).toEqual(["hero", "cta"]);
  });

  it("asigna un id a las secciones que no lo traen", () => {
    // El id es lo que da idempotencia a set_sections y estabilidad al arrastrar.
    const { sections } = parseSections([heroOk]);
    expect(sections[0].id).toMatch(/^sec_/);
  });

  it("respeta un id que ya venía, para no romper patch_section", () => {
    const { sections } = parseSections([{ ...heroOk, id: "sec_fijo" }]);
    expect(sections[0].id).toBe("sec_fijo");
  });

  it("rellena los defaults del registro", () => {
    const { sections } = parseSections([{ type: "hero", v: 1, data: { title: "H" } }]);
    expect(sections[0].data.align).toBe("centro");
  });

  it("descarta un tipo desconocido y lo dice, en vez de callar", () => {
    const { sections, errors } = parseSections([{ type: "parallax", v: 1, data: {} }]);
    expect(sections).toHaveLength(0);
    expect(errors[0].message).toContain("parallax");
    expect(errors[0].index).toBe(0);
  });

  it("una sección rota no se lleva por delante a las demás", () => {
    const { sections, errors } = parseSections([{ type: "parallax" }, heroOk]);
    expect(sections.map((s) => s.type)).toEqual(["hero"]);
    expect(errors).toHaveLength(1);
  });

  it("señala el campo requerido que falta, con índice y clave", () => {
    const { errors } = parseSections([{ type: "hero", v: 1, data: {} }]);
    expect(errors[0]).toMatchObject({ index: 0, type: "hero", key: "title" });
  });

  it("en modo strict no deja pasar una sección incompleta", () => {
    const { sections } = parseSections([{ type: "hero", v: 1, data: {} }], { strict: true });
    expect(sections).toHaveLength(0);
  });

  it("aplica allowedSections", () => {
    const { sections, errors } = parseSections([heroOk], { allowed: ["cta"] });
    expect(sections).toHaveLength(0);
    expect(errors[0].message).toContain("no está permitida");
  });

  it("sella la versión actual del registro, no la que venía", () => {
    const { sections } = parseSections([{ ...heroOk, v: 99 }]);
    expect(sections[0].v).toBe(1);
  });

  it("nunca lanza ante basura", () => {
    for (const junk of [null, undefined, "", "texto", 42, {}, [null], [1], [[]], [{ type: 1 }]]) {
      expect(() => parseSections(junk)).not.toThrow();
    }
    expect(parseSections("texto").errors[0].message).toContain("lista");
    expect(parseSections(null).sections).toEqual([]);
  });

  it("conserva hidden y anchor sólo cuando vienen", () => {
    const [con] = parseSections([{ ...heroOk, hidden: true, anchor: "arriba" }]).sections;
    expect(con).toMatchObject({ hidden: true, anchor: "arriba" });
    const [sin] = parseSections([heroOk]).sections;
    expect(sin).not.toHaveProperty("hidden");
    expect(sin).not.toHaveProperty("anchor");
  });

  it("es idempotente: pasar dos veces da lo mismo", () => {
    const once = parseSections([heroOk]).sections;
    const twice = parseSections(once).sections;
    expect(twice).toEqual(once);
  });
});

describe("coerceSectionData", () => {
  const fields: FieldDefinition[] = [
    { key: "title", label: "T", type: "text", required: true },
    { key: "fotos", label: "F", type: "gallery" },
  ];

  it("descarta claves que la sección no declara", () => {
    // Sin esto, un campo renombrado deja su valor viejo para siempre y el agente lo
    // sigue arrastrando de copia en copia.
    const { data } = coerceSectionData(fields, { title: "x", obsoleto: "z" });
    expect(data).toEqual({ title: "x", fotos: [] });
  });

  it("informa de los requeridos vacíos", () => {
    expect(coerceSectionData(fields, {}).missing).toEqual(["title"]);
    expect(coerceSectionData(fields, { title: "x" }).missing).toEqual([]);
  });
});

describe("formatSectionErrors", () => {
  it("nombra índice, tipo y clave para que se pueda corregir de una", () => {
    const msg = formatSectionErrors([
      { index: 1, type: "hero", key: "title", message: "Falta." },
    ]);
    expect(msg).toContain("sección 2");
    expect(msg).toContain("hero");
    expect(msg).toContain("title");
  });
});
