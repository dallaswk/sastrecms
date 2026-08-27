import { describe, it, expect } from "vitest";
import { resolveRenderer, sectionsFieldOf, type RenderableType } from "./renderers";

const type = (over: Partial<RenderableType>): RenderableType => ({
  key: "page",
  hasArchive: false,
  ...over,
});

const withSections = type({
  key: "landing",
  fieldSchema: [
    { key: "body", label: "Contenido", type: "richtext" },
    { key: "bloques", label: "Secciones", type: "sections" },
  ],
});

describe("sectionsFieldOf", () => {
  it("encuentra el campo de secciones sea cual sea su clave", () => {
    expect(sectionsFieldOf(withSections)?.key).toBe("bloques");
  });

  it("devuelve null cuando el tipo no tiene constructor de páginas", () => {
    expect(sectionsFieldOf(type({ fieldSchema: [] }))).toBeNull();
    expect(sectionsFieldOf(null)).toBeNull();
  });
});

describe("resolveRenderer", () => {
  it("las secciones mandan sobre todo lo demás cuando hay bloques", () => {
    expect(resolveRenderer(withSections, { bloques: [{ type: "hero" }] })).toBe("sections");
  });

  it("un campo de secciones vacío no secuestra la página", () => {
    // Añadir el campo al tipo no debe dejar en blanco los nodos que aún no lo usan.
    expect(resolveRenderer(withSections, { bloques: [] })).toBe("generic");
    expect(resolveRenderer(withSections, {})).toBe("generic");
    expect(resolveRenderer(withSections, { bloques: "" })).toBe("generic");
  });

  it("el archivo gana a la clave del tipo", () => {
    expect(resolveRenderer(type({ key: "post", hasArchive: true }))).toBe("archive");
  });

  it("mantiene los renderers específicos que ya existían", () => {
    expect(resolveRenderer(type({ key: "post" }))).toBe("post");
    expect(resolveRenderer(type({ key: "portfolio_item" }))).toBe("portfolio_item");
  });

  it("un tipo personalizado va al genérico, no a un renderer que ignora sus campos", () => {
    // Este era el agujero: 'servicio' caía en PageRenderer, que sólo pinta fields.body,
    // así que sus campos propios no se veían nunca en el sitio.
    expect(resolveRenderer(type({ key: "servicio" }))).toBe("generic");
    expect(resolveRenderer(type({ key: "page" }))).toBe("generic");
  });

  it("sin tipo de contenido no lanza", () => {
    expect(resolveRenderer(null)).toBe("generic");
    expect(resolveRenderer(undefined, { x: 1 })).toBe("generic");
  });
});
