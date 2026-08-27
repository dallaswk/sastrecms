import { describe, it, expect } from "vitest";
import { SECTIONS } from "./registry";
import { SECTION_COMPONENTS } from "@components/sections/index";

/**
 * The registry is plain TypeScript and the component map imports .astro files, so they
 * cannot be one module. This is the only structural duplication in the sections design,
 * and this is the test that keeps it honest — the same role id.test.ts plays for
 * computePath/recomputePaths.
 */
describe("registro de secciones ↔ componentes Astro", () => {
  it("cada sección declarada tiene componente, y cada componente su sección", () => {
    expect(Object.keys(SECTION_COMPONENTS).sort()).toEqual(Object.keys(SECTIONS).sort());
  });

  it("el stub de .astro no ha dejado el mapa vacío", () => {
    // Si el plugin de vitest dejara de resolver, el import daría {} y la comparación de
    // arriba pasaría por vacuidad contra un registro también vacío. Esto lo impide.
    expect(Object.keys(SECTION_COMPONENTS).length).toBeGreaterThan(0);
    expect(Object.keys(SECTIONS).length).toBeGreaterThan(0);
  });
});
