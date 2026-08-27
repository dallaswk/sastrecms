import { describe, it, expect } from "vitest";
import { resolveSectionRefs, buildSections, buildMenus, orderedPages } from "./apply";
import type { SitePreset } from "./types";

const ids = new Map([["trabajos", "n_1"], ["contacto", "n_2"]]);
let counter = 0;
const makeId = () => `sec_${++counter}`;

describe("resolveSectionRefs", () => {
  it("traduce el slug de un campo relación a su id", () => {
    const out = resolveSectionRefs({ type: "collection", data: { parent: "trabajos", limit: 6 } }, ids);
    expect(out.data.parent).toBe("n_1");
    expect(out.data.limit).toBe(6);
  });

  it("vacía un slug que no se resolvió, en vez de dejarlo pasando por id", () => {
    // "trabajos" en un campo de relación parece un id y no encontraría nada nunca.
    const out = resolveSectionRefs({ type: "collection", data: { parent: "inexistente" } }, ids);
    expect(out.data.parent).toBe("");
  });

  it("no toca campos que no son relaciones", () => {
    const out = resolveSectionRefs({ type: "hero", data: { title: "trabajos" } }, ids);
    expect(out.data.title).toBe("trabajos");
  });

  it("devuelve la sección intacta si el tipo no existe", () => {
    const input = { type: "inventada", data: { parent: "trabajos" } };
    expect(resolveSectionRefs(input, ids)).toEqual(input);
  });

  it("no muta la entrada", () => {
    const input = { type: "collection", data: { parent: "trabajos" } };
    resolveSectionRefs(input, ids);
    expect(input.data.parent).toBe("trabajos");
  });
});

describe("buildSections", () => {
  it("pone id y la versión que dice el registro", () => {
    counter = 0;
    const [section] = buildSections([{ type: "hero", data: { title: "X" } }], ids, makeId);
    expect(section.id).toBe("sec_1");
    expect(section.v).toBeGreaterThanOrEqual(1);
  });

  it("conserva el ancla sólo si venía", () => {
    counter = 0;
    const [withAnchor] = buildSections([{ type: "hero", data: {}, anchor: "arriba" }], ids, makeId);
    const [without] = buildSections([{ type: "hero", data: {} }], ids, makeId);
    expect(withAnchor.anchor).toBe("arriba");
    expect(without).not.toHaveProperty("anchor");
  });

  it("tolera que no haya secciones", () => {
    expect(buildSections(undefined, ids, makeId)).toEqual([]);
  });
});

describe("buildMenus", () => {
  it("convierte slugs en ids y deja pasar las URLs", () => {
    expect(buildMenus({ main: [{ label: "Trabajos", slug: "trabajos" }, { label: "Doc", url: "https://x.test" }] }, ids))
      .toEqual({ main: [{ label: "Trabajos", nodeId: "n_1" }, { label: "Doc", url: "https://x.test" }] });
  });

  it("descarta la entrada cuyo slug no existe", () => {
    expect(buildMenus({ main: [{ label: "Fantasma", slug: "no-existe" }] }, ids)).toEqual({});
  });

  it("omite el menú que queda vacío en vez de guardarlo como lista vacía", () => {
    expect(buildMenus({ main: [], legal: [{ label: "Aviso", slug: "contacto" }] }, ids))
      .toEqual({ legal: [{ label: "Aviso", nodeId: "n_2" }] });
  });
});

describe("orderedPages", () => {
  const preset = (pages: SitePreset["pages"]): SitePreset =>
    ({ key: "t", label: "T", description: "x".repeat(40), tagline: "", theme: {}, pages, menus: {} });

  it("saca al padre antes que al hijo aunque estén al revés", () => {
    const out = orderedPages(preset([
      { slug: "hijo", title: "H", parentSlug: "padre" },
      { slug: "padre", title: "P" },
    ]));
    expect(out.map((p) => p.slug)).toEqual(["padre", "hijo"]);
  });

  it("no repite páginas", () => {
    const out = orderedPages(preset([
      { slug: "a", title: "A" },
      { slug: "b", title: "B", parentSlug: "a" },
      { slug: "c", title: "C", parentSlug: "a" },
    ]));
    expect(out.map((p) => p.slug)).toEqual(["a", "b", "c"]);
  });

  it("no se cuelga con una referencia circular", () => {
    // Un preset mal escrito no debe bloquear el asistente indefinidamente.
    const out = orderedPages(preset([
      { slug: "a", title: "A", parentSlug: "b" },
      { slug: "b", title: "B", parentSlug: "a" },
    ]));
    expect(out).toHaveLength(2);
  });

  it("ignora un padre que no existe en vez de perder la página", () => {
    const out = orderedPages(preset([{ slug: "a", title: "A", parentSlug: "fantasma" }]));
    expect(out.map((p) => p.slug)).toEqual(["a"]);
  });
});
