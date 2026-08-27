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

  it("el archivo gana a la clave del tipo, pero sólo donde hay un listado", () => {
    // Este test afirmaba antes que `hasArchive` ganaba siempre, y eso era el fallo: como
    // `hasArchive` es del tipo y no del nodo, cada post individual se pintaba como un
    // archivo vacío y su cuerpo no aparecía nunca. Ahora hace falta que el nodo sea la raíz
    // del listado o que tenga hijos que listar.
    expect(resolveRenderer(type({ key: "post", hasArchive: true }), {}, { isRoot: true })).toBe("archive");
    expect(resolveRenderer(type({ key: "post", hasArchive: true }), {}, { hasChildren: true })).toBe("archive");
    expect(resolveRenderer(type({ key: "post", hasArchive: true }))).toBe("post");
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

/**
 * El fallo que salió al etiquetar og:type.
 *
 * `hasArchive` es una propiedad del *tipo*, no del nodo, así que un post individual caía en
 * el renderer de archivo — que pinta la lista de hijos de un nodo — y mostraba su título y
 * «No hay entradas todavía». El cuerpo del post no aparecía nunca.
 */
describe("resolveRenderer: archivo vs entrada", () => {
  const postType = { key: "post", hasArchive: true, fieldSchema: [] };

  it("un post individual se pinta como post, no como archivo vacío", () => {
    expect(resolveRenderer(postType, {}, { hasChildren: false, isRoot: false })).toBe("post");
  });

  it("la raíz del archivo sigue siendo archivo aunque no tenga entradas", () => {
    // Si no, borrar la última entrada convertiría el listado en una entrada suelta.
    expect(resolveRenderer(postType, {}, { hasChildren: false, isRoot: true })).toBe("archive");
  });

  it("un nodo con hijos es un listado, aunque esté anidado", () => {
    expect(resolveRenderer(postType, {}, { hasChildren: true, isRoot: false })).toBe("archive");
  });

  it("sin información de posición no adivina: no es un archivo", () => {
    expect(resolveRenderer(postType, {})).toBe("post");
  });

  it("las secciones siguen ganando a todo lo demás", () => {
    const withSections = {
      key: "post",
      hasArchive: true,
      fieldSchema: [{ key: "bloques", label: "Secciones", type: "sections" as const }],
    };
    expect(
      resolveRenderer(withSections, { bloques: [{ id: "s1", type: "hero", v: 1, data: {} }] }, { isRoot: true })
    ).toBe("sections");
  });

  it("un tipo cualquiera con archivo y sin renderer propio cae en generic al ser hoja", () => {
    const servicio = { key: "servicio", hasArchive: true, fieldSchema: [] };
    expect(resolveRenderer(servicio, {}, { hasChildren: false, isRoot: false })).toBe("generic");
    expect(resolveRenderer(servicio, {}, { isRoot: true })).toBe("archive");
  });
});
