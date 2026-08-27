import { describe, it, expect } from "vitest";
import {
  TRACKERS,
  activeTrackers,
  neededCategories,
  needsBanner,
  cookieTable,
  NECESSARY_COOKIES,
  parseConsent,
  consentCovers,
  consentModeSignals,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  CONSENT_CATEGORIES,
} from "./consent";
import { ANALYTICS_ID_SHAPES } from "./analytics";

describe("el registro de trackers", () => {
  it("cubre todos los identificadores que el CMS sabe cargar", () => {
    // gscVerification queda fuera a propósito: es una meta, no fija cookies y no necesita
    // consentimiento. Si se colara, el sitio no podría verificarse ante Google hasta que
    // alguien aceptara cookies.
    const known = new Set(TRACKERS.map((t) => t.key));
    const shapes = Object.keys(ANALYTICS_ID_SHAPES).filter((k) => k !== "gscVerification");
    expect([...known].sort()).toEqual(shapes.sort());
    expect(known.has("gscVerification" as never)).toBe(false);
  });

  it("cada tracker declara proveedor, transferencia y política", () => {
    for (const tracker of TRACKERS) {
      expect(tracker.provider, tracker.key).toBeTruthy();
      expect(tracker.transfer, tracker.key).toBeTruthy();
      expect(tracker.privacyUrl, tracker.key).toMatch(/^https:\/\//);
      expect(tracker.cookies.length, tracker.key).toBeGreaterThan(0);
    }
  });

  it("cada categoría tiene etiqueta y explicación", () => {
    for (const category of CONSENT_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
      expect(CATEGORY_DESCRIPTIONS[category]).toBeTruthy();
    }
  });
});

describe("qué se pregunta", () => {
  it("sin ningún tracker no hay banner que mostrar", () => {
    // Un banner innecesario es un motivo para irse, y el consentimiento para una finalidad
    // que no existe no es consentimiento válido.
    expect(needsBanner({})).toBe(false);
    expect(needsBanner({ gscVerification: "abc" })).toBe(false);
    expect(neededCategories({})).toEqual([]);
  });

  it("sólo analítica si sólo hay analítica", () => {
    expect(neededCategories({ ga4: "G-XXXX" })).toEqual(["analitica"]);
  });

  it("sólo marketing si sólo hay marketing", () => {
    expect(neededCategories({ metaPixel: "123" })).toEqual(["marketing"]);
  });

  it("las dos cuando hay de las dos, y en orden estable", () => {
    expect(neededCategories({ hotjar: "1", tiktokPixel: "2" })).toEqual(["analitica", "marketing"]);
  });

  it("un identificador vacío no cuenta como configurado", () => {
    expect(needsBanner({ ga4: "" })).toBe(false);
    expect(needsBanner({ ga4: "   " })).toBe(false);
  });

  it("activeTrackers devuelve sólo los configurados", () => {
    expect(activeTrackers({ ga4: "G-X", metaPixel: "" }).map((t) => t.key)).toEqual(["ga4"]);
  });
});

describe("cookieTable", () => {
  it("siempre lleva las necesarias, porque siempre son ciertas", () => {
    const rows = cookieTable({});
    expect(rows).toHaveLength(NECESSARY_COOKIES.length);
    expect(rows.every((r) => r.category === "necesarias")).toBe(true);
  });

  it("se deriva de los trackers configurados, que es lo que nadie mantiene a mano", () => {
    const rows = cookieTable({ ga4: "G-X" });
    expect(rows.some((r) => r.name === "_ga" && r.provider === "Google Analytics 4")).toBe(true);
    expect(rows.some((r) => r.name === "_fbp")).toBe(false);
  });

  it("añadir un pixel añade sus filas sin tocar la política a mano", () => {
    const before = cookieTable({ ga4: "G-X" }).length;
    const after = cookieTable({ ga4: "G-X", metaPixel: "123" }).length;
    expect(after).toBeGreaterThan(before);
  });

  it("cada fila dice proveedor, finalidad y conservación: es lo que exige el RGPD", () => {
    for (const row of cookieTable({ ga4: "G-X", metaPixel: "1", hotjar: "2", tiktokPixel: "3", gtm: "GTM-X" })) {
      expect(row.provider, row.name).toBeTruthy();
      expect(row.purpose, row.name).toBeTruthy();
      expect(row.retention, row.name).toBeTruthy();
    }
  });
});

describe("parseConsent", () => {
  it("lee una decisión guardada", () => {
    expect(parseConsent('{"analitica":true,"marketing":false}')).toEqual({
      analitica: true,
      marketing: false,
    });
  });

  it("lo ilegible es «no preguntado», que carga menos, no más", () => {
    for (const raw of [null, undefined, "", "no soy json", "{}", '{"analitica":"sí"}', "[]"]) {
      expect(parseConsent(raw), String(raw)).toBeNull();
    }
  });

  it("ignora claves que no son categorías", () => {
    expect(parseConsent('{"analitica":true,"loquesea":true}')).toEqual({ analitica: true });
  });
});

describe("consentCovers", () => {
  it("una decisión completa vale", () => {
    expect(consentCovers({ analitica: true }, { ga4: "G-X" })).toBe(true);
  });

  it("añadir un pixel de marketing obliga a volver a preguntar", () => {
    // Quien aceptó sólo analítica no ha consentido nada sobre marketing, así que el pixel
    // nuevo no puede cargar sobre un «acepto» antiguo.
    expect(consentCovers({ analitica: true }, { ga4: "G-X", metaPixel: "123" })).toBe(false);
  });

  it("sin decisión no cubre nada", () => {
    expect(consentCovers(null, { ga4: "G-X" })).toBe(false);
  });

  it("un rechazo es una decisión, no una ausencia", () => {
    expect(consentCovers({ analitica: false }, { ga4: "G-X" })).toBe(true);
  });

  it("sin trackers, cualquier decisión cubre: no hay nada que cubrir", () => {
    expect(consentCovers({ analitica: false }, {})).toBe(true);
  });
});

describe("consentModeSignals", () => {
  it("marketing gobierna las tres señales de publicidad", () => {
    expect(consentModeSignals({ marketing: true, analitica: false })).toEqual({
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "denied",
    });
  });

  it("una decisión ausente es denegada, nunca concedida por omisión", () => {
    const signals = consentModeSignals({});
    expect(Object.values(signals).every((v) => v === "denied")).toBe(true);
  });
});
