import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FIXES, fixFor, isAutomatic, AUTOMATIC_FIX_IDS, LEGAL_PAGES, DEFAULT_CONTACT_FIELDS } from "./fixes";
import { buildChecklist, type SiteSnapshot } from "./launch-checklist";
import { parseFormFields } from "./forms/validate";
import { LEGAL_DOCUMENTS } from "./legal";

const empty: SiteSnapshot = {
  analytics: {}, integrations: {}, publishedPaths: [], draftCount: 0,
  pagesWithoutDescription: [], imagesWithoutAlt: 3, imagesWithoutDimensions: 2,
  mainMenuItems: 0, legalMenuItems: 0, hasContactForm: false, emptyPages: ["/x"],
  business: {}, siteName: "", contactEmail: "",
};

describe("el catálogo de arreglos", () => {
  it("cada comprobación que puede fallar tiene un arreglo declarado", () => {
    // Un punto en rojo sin nada que hacer al lado es un callejón sin salida.
    const failing = buildChecklist(empty).filter((check) => check.status !== "ok");
    for (const check of failing) {
      expect(fixFor(check.id), `${check.id} no tiene arreglo declarado`).toBeDefined();
    }
  });

  it("ningún arreglo apunta a una comprobación que no existe", () => {
    // Al revés: un arreglo huérfano es un botón que nunca se pinta.
    const ids = new Set([
      ...buildChecklist(empty).map((c) => c.id),
      // las que sólo aparecen cuando el sitio va bien
      "contact-email", "resend", "turnstile", "consent",
    ]);
    for (const fix of FIXES) {
      expect(ids, `${fix.checkId} no corresponde a ninguna comprobación`).toContain(fix.checkId);
    }
  });

  it("los tres tipos están representados", () => {
    const kinds = new Set(FIXES.map((f) => f.kind));
    expect(kinds).toEqual(new Set(["auto", "ai", "manual"]));
  });

  it("un arreglo automático que crea algo avisa antes", () => {
    for (const fix of FIXES.filter((f) => f.kind === "auto")) {
      expect(fix.confirm, fix.checkId).toBeTruthy();
    }
  });

  it("un arreglo manual explica por qué no es automático", () => {
    // Sin el motivo, un botón que sólo lleva a Ajustes parece que el sistema no supo hacerlo.
    for (const fix of FIXES.filter((f) => f.kind === "manual")) {
      expect(fix.because, fix.checkId).toBeTruthy();
    }
  });

  it("ningún botón dice sólo «Arreglar»", () => {
    for (const fix of FIXES) {
      expect(fix.label.toLowerCase(), fix.checkId).not.toBe("arreglar");
      expect(fix.label.length, fix.checkId).toBeGreaterThan(6);
    }
  });

  it("los datos que sólo tiene el dueño nunca son automáticos ni de IA", () => {
    // Una IA rellenando un NIF se lo estaría inventando.
    for (const id of ["business", "contact-email", "resend", "turnstile", "identity"]) {
      expect(fixFor(id)!.kind, id).toBe("manual");
    }
  });

  it("isAutomatic y AUTOMATIC_FIX_IDS coinciden", () => {
    for (const id of AUTOMATIC_FIX_IDS) expect(isAutomatic(id)).toBe(true);
    expect(isAutomatic("business")).toBe(false);
    expect(isAutomatic("inventado")).toBe(false);
  });
});

describe("los datos que usan los arreglos", () => {
  it("las tres legales apuntan a documentos que el generador conoce", () => {
    for (const page of LEGAL_PAGES) {
      expect(LEGAL_DOCUMENTS as readonly string[], page.slug).toContain(page.document);
    }
  });

  it("las tres legales son las que la comprobación busca", () => {
    const detail = buildChecklist(empty).find((c) => c.id === "legal")!.detail;
    for (const page of LEGAL_PAGES) expect(detail).toContain(page.slug);
  });

  it("los campos del formulario por defecto sobreviven al parser del servidor", () => {
    // Si el arreglo escribiera un campo que parseFormFields descarta, el formulario
    // aparecería con menos campos de los que dice haber puesto.
    const parsed = parseFormFields(DEFAULT_CONTACT_FIELDS.map((f) => ({ ...f })));
    expect(parsed).toHaveLength(DEFAULT_CONTACT_FIELDS.length);
    expect(parsed.some((f) => f.type === "email")).toBe(true);
  });
});

/**
 * El invariante que evita el peor fallo de este diseño: un botón que se pinta y no hace nada.
 *
 * El catálogo dice qué puntos tienen arreglo automático; los handlers de la acción dicen qué se
 * puede ejecutar de verdad. Si divergen, el dashboard pinta un botón que devuelve un error
 * interno — y eso sólo se descubre pulsándolo.
 *
 * Se comprueba leyendo el fuente porque vitest no puede importar un módulo que usa
 * `astro:actions`. Es la misma técnica que el proyecto ya usa para el registro de secciones
 * frente al mapa de componentes .astro: una frontera que el test no puede cruzar de otra forma.
 */
describe("catálogo ↔ implementación", () => {
  const source = readFileSync(new URL("../actions/fixes.ts", import.meta.url), "utf8");
  const block = source.slice(
    source.indexOf("const HANDLERS"),
    source.indexOf("};", source.indexOf("const HANDLERS"))
  );
  const implemented = [...block.matchAll(/^\s*"?([a-z-]+)"?:\s*fix[A-Z]/gm)].map((m) => m[1]!);

  it("el fuente declara handlers reconocibles", () => {
    // Si el formato del registro cambia, este test dejaría de comprobar nada en silencio.
    expect(implemented.length).toBeGreaterThan(0);
  });

  it("todo arreglo automático declarado está implementado", () => {
    for (const id of AUTOMATIC_FIX_IDS) {
      expect(implemented, `${id} no tiene handler`).toContain(id);
    }
  });

  it("y toda implementación está declarada como automática", () => {
    for (const id of implemented) {
      expect(isAutomatic(id), `${id} tiene handler pero no está declarado`).toBe(true);
    }
  });
});
