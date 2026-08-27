import { describe, it, expect } from "vitest";
import {
  summariseChange,
  isWorthSnapshotting,
  revisionsToPrune,
  MAX_REVISIONS_PER_NODE,
  type RevisionSnapshot,
} from "./revisions";

const base: RevisionSnapshot = {
  title: "Portada",
  slug: "index",
  status: "published",
  fields: { bloques: [{ type: "hero", id: "a" }, { type: "cta", id: "b" }] },
  seo: { metaTitle: "Portada" },
};

describe("summariseChange", () => {
  it("nombra el título antiguo y el nuevo", () => {
    expect(summariseChange(base, { title: "Inicio" })).toBe("título: «Portada» → «Inicio»");
  });

  it("cuenta los bloques ganados o perdidos, que es lo que distingue una versión de otra", () => {
    const more = { fields: { bloques: [{ type: "hero", id: "a" }, { type: "cta", id: "b" }, { type: "faq", id: "c" }] } };
    expect(summariseChange(base, more)).toBe("+1 bloque(s)");
    const fewer = { fields: { bloques: [{ type: "hero", id: "a" }] } };
    expect(summariseChange(base, fewer)).toBe("−1 bloque(s)");
  });

  it("mismo número de bloques con contenido distinto se dice como edición", () => {
    const edited = { fields: { bloques: [{ type: "hero", id: "a", data: { title: "x" } }, { type: "cta", id: "b" }] } };
    expect(summariseChange(base, edited)).toBe("contenido editado");
  });

  it("acumula varios cambios en una línea", () => {
    const summary = summariseChange(base, { title: "Inicio", status: "draft" });
    expect(summary).toContain("título");
    expect(summary).toContain("estado");
    expect(summary).toContain(" · ");
  });

  it("sin cambios lo dice, en vez de una cadena vacía", () => {
    expect(summariseChange(base, {})).toBe("sin cambios visibles");
    expect(summariseChange(base, { title: base.title })).toBe("sin cambios visibles");
  });

  it("cuenta bloques en cualquier campo de secciones, no sólo en «bloques»", () => {
    const other: RevisionSnapshot = { ...base, fields: { secciones: [{ type: "hero", id: "a" }] } };
    expect(summariseChange(other, { fields: { secciones: [] } })).toBe("−1 bloque(s)");
  });

  it("no confunde una lista cualquiera con bloques", () => {
    const gallery: RevisionSnapshot = { ...base, fields: { galeria: ["a.jpg", "b.jpg"] } };
    expect(summariseChange(gallery, { fields: { galeria: ["a.jpg"] } })).toBe("contenido editado");
  });
});

describe("isWorthSnapshotting", () => {
  it("un guardado que no cambia nada no gasta una revisión", () => {
    // Veinte guardados en vacío expulsarían todas las revisiones de verdad de un historial
    // con tope, que es justo cuando alguien las necesita.
    expect(isWorthSnapshotting(base, {})).toBe(false);
    expect(isWorthSnapshotting(base, { title: base.title, fields: base.fields })).toBe(false);
  });

  it("cualquier cambio real sí", () => {
    expect(isWorthSnapshotting(base, { title: "Otro" })).toBe(true);
    expect(isWorthSnapshotting(base, { status: "draft" })).toBe(true);
    expect(isWorthSnapshotting(base, { fields: {} })).toBe(true);
    expect(isWorthSnapshotting(base, { seo: {} })).toBe(true);
  });
});

describe("revisionsToPrune", () => {
  it("por debajo del tope no tira nada", () => {
    expect(revisionsToPrune(["a", "b"])).toEqual([]);
  });

  it("por encima tira las más antiguas, que van primero", () => {
    const ids = Array.from({ length: MAX_REVISIONS_PER_NODE + 3 }, (_, i) => `r${i}`);
    expect(revisionsToPrune(ids)).toEqual(["r0", "r1", "r2"]);
  });

  it("respeta un tope propio", () => {
    expect(revisionsToPrune(["a", "b", "c"], 1)).toEqual(["a", "b"]);
  });
});
