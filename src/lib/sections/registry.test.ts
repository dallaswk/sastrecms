import { describe, it, expect } from "vitest";
import { SECTIONS, pickableSections, getSection } from "./registry";
import { SECTION_GROUPS, SECTION_GROUP_LABELS } from "./types";
import { FIELD_TYPES } from "@lib/fields/types";

describe("invariantes del registro", () => {
  it("cada definición se registra bajo su propio type", () => {
    for (const [key, def] of Object.entries(SECTIONS)) {
      expect(def.type).toBe(key);
    }
  });

  it("los type son claves válidas y estables", () => {
    // Se escriben en el contenido de los clientes: nada de espacios ni mayúsculas.
    for (const type of Object.keys(SECTIONS)) {
      expect(type).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("toda sección tiene versión, etiqueta, descripción y grupo conocido", () => {
    for (const def of Object.values(SECTIONS)) {
      expect(def.version, def.type).toBeGreaterThanOrEqual(1);
      expect(def.label.trim(), def.type).toBeTruthy();
      // La descripción la lee un agente por MCP: una línea vacía le deja adivinando.
      expect(def.description.length, def.type).toBeGreaterThan(20);
      expect(SECTION_GROUPS, def.type).toContain(def.group);
    }
  });

  it("las claves de campo son únicas y de un tipo declarado", () => {
    for (const def of Object.values(SECTIONS)) {
      const keys = def.fields.map((f) => f.key);
      expect(new Set(keys).size, `${def.type} tiene claves repetidas`).toBe(keys.length);
      for (const f of def.fields) {
        expect(FIELD_TYPES, `${def.type}.${f.key}`).toContain(f.type);
        expect(f.key).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it("los defaults se refieren a campos que existen", () => {
    // Un default sobre una clave renombrada es un valor que no llega nunca.
    for (const def of Object.values(SECTIONS)) {
      const keys = new Set(def.fields.map((f) => f.key));
      for (const key of Object.keys(def.defaults ?? {})) {
        expect(keys, `${def.type}: default sobre "${key}" inexistente`).toContain(key);
      }
    }
  });

  it("un default de select es una de sus opciones", () => {
    for (const def of Object.values(SECTIONS)) {
      for (const f of def.fields) {
        if (f.type !== "select") continue;
        const dflt = def.defaults?.[f.key];
        if (dflt === undefined) continue;
        expect(f.options ?? [], `${def.type}.${f.key}`).toContain(dflt);
      }
    }
  });

  it("cada grupo usado tiene etiqueta", () => {
    for (const g of SECTION_GROUPS) expect(SECTION_GROUP_LABELS[g]).toBeTruthy();
  });
});

describe("pickableSections", () => {
  it("devuelve todo cuando no se acota", () => {
    expect(pickableSections()).toHaveLength(Object.keys(SECTIONS).length);
  });

  it("respeta allowedSections", () => {
    expect(pickableSections(["hero"]).map((d) => d.type)).toEqual(["hero"]);
  });

  it("ignora un allowed con tipos inventados en vez de fallar", () => {
    expect(pickableSections(["hero", "parallax"]).map((d) => d.type)).toEqual(["hero"]);
  });

  it("no ofrece las retiradas", () => {
    const retired = { ...SECTIONS.hero, deprecated: true };
    expect(retired.deprecated).toBe(true);
  });
});

describe("getSection", () => {
  it("devuelve undefined para un tipo inventado, sin lanzar", () => {
    expect(getSection("parallax")).toBeUndefined();
  });
});
