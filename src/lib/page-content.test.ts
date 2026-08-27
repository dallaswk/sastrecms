import { describe, it, expect } from "vitest";
import { hasVisibleContent, isSelfWriting, SELF_WRITING_SECTIONS } from "./page-content";

const pageType = {
  fieldSchema: [
    { key: "body", label: "Texto", type: "richtext" as const },
    { key: "bloques", label: "Secciones", type: "sections" as const },
  ],
};

describe("hasVisibleContent", () => {
  it("una página con bloques tiene contenido", () => {
    expect(hasVisibleContent({ bloques: [{ type: "hero", id: "a" }] }, pageType)).toBe(true);
  });

  it("una página con cuerpo tiene contenido", () => {
    expect(hasVisibleContent({ body: "<p>Algo</p>" }, pageType)).toBe(true);
  });

  it("una legal cuenta como que tiene contenido, aunque su texto se genere al pintar", () => {
    // Era el falso positivo: `extractPageText` no ve nada en {document: "aviso-legal"}, así que
    // la página se ofrecía para que la IA escribiera un aviso legal inventado encima del real.
    const legal = { bloques: [{ type: "legal", id: "a", data: { document: "aviso-legal" } }] };
    expect(hasVisibleContent(legal, pageType)).toBe(true);
  });

  it("una página de contacto también", () => {
    const contact = { bloques: [{ type: "contact", id: "a", data: { fields: [] } }] };
    expect(hasVisibleContent(contact, pageType)).toBe(true);
  });

  it("vacía de verdad es vacía", () => {
    expect(hasVisibleContent({}, pageType)).toBe(false);
    expect(hasVisibleContent({ bloques: [] }, pageType)).toBe(false);
    expect(hasVisibleContent({ body: "   " }, pageType)).toBe(false);
    expect(hasVisibleContent({ body: "" , bloques: [] }, pageType)).toBe(false);
  });

  it("un tipo sin campo de secciones se juzga sólo por su cuerpo", () => {
    const simple = { fieldSchema: [{ key: "body", label: "Texto", type: "richtext" as const }] };
    expect(hasVisibleContent({ bloques: [{ type: "hero" }] }, simple)).toBe(false);
    expect(hasVisibleContent({ body: "Hola mundo" }, simple)).toBe(true);
  });

  it("no lanza con nada", () => {
    expect(hasVisibleContent(null, null)).toBe(false);
    expect(hasVisibleContent(undefined, pageType)).toBe(false);
    expect(hasVisibleContent({ bloques: "no soy una lista" }, pageType)).toBe(false);
  });
});

describe("isSelfWriting", () => {
  it("una página que sólo tiene bloques que se escriben solos no admite composición", () => {
    for (const type of SELF_WRITING_SECTIONS) {
      expect(isSelfWriting({ bloques: [{ type, id: "a" }] }, pageType), type).toBe(true);
    }
  });

  it("mezclada con un bloque normal, sí admite", () => {
    expect(
      isSelfWriting({ bloques: [{ type: "legal", id: "a" }, { type: "prose", id: "b" }] }, pageType)
    ).toBe(false);
  });

  it("sin bloques no es autoescrita: está vacía, que es distinto", () => {
    expect(isSelfWriting({ bloques: [] }, pageType)).toBe(false);
    expect(isSelfWriting({}, pageType)).toBe(false);
  });
});
