import { describe, it, expect } from "vitest";
import { buildChecklist, summarise, type SiteSnapshot } from "./launch-checklist";

const complete: SiteSnapshot = {
  siteName: "Reformas Ruiz",
  tagline: "Reformas integrales en Madrid",
  logoUrl: "https://m.test/logo.svg",
  faviconUrl: "https://m.test/fav.svg",
  contactEmail: "hola@reformas.test",
  business: {
    legalName: "Reformas Ruiz S.L.", taxId: "B12345674", address: "Calle Mayor 4",
    postalCode: "28013", city: "Madrid", email: "hola@reformas.test",
  },
  analytics: {},
  integrations: { resendApiKey: "re_x", turnstileSecretKey: "0x1" },
  publishedPaths: ["/", "/aviso-legal", "/politica-de-privacidad", "/politica-de-cookies", "/contacto"],
  draftCount: 0,
  pagesWithoutDescription: [],
  imagesWithoutAlt: 0,
  imagesWithoutDimensions: 0,
  mainMenuItems: 4,
  legalMenuItems: 3,
  hasContactForm: true,
  emptyPages: [],
};

const find = (snapshot: SiteSnapshot, id: string) =>
  buildChecklist(snapshot).find((check) => check.id === id);

describe("un sitio terminado", () => {
  it("no tiene bloqueantes y se marca como listo", () => {
    const summary = summarise(buildChecklist(complete));
    expect(summary.blockers).toBe(0);
    expect(summary.ready).toBe(true);
    expect(summary.progress).toBe(100);
  });

  it("cada comprobación devuelve etiqueta y detalle, nunca una tarjeta vacía", () => {
    for (const check of buildChecklist(complete)) {
      expect(check.label, check.id).toBeTruthy();
      expect(check.id, check.id).toBeTruthy();
    }
  });

  it("una comprobación cumplida no ofrece enlace de arreglo", () => {
    for (const check of buildChecklist(complete)) {
      if (check.status === "ok") expect(check.href, check.id).toBeUndefined();
    }
  });
});

describe("los bloqueantes", () => {
  it("sin portada publicada el dominio no muestra nada", () => {
    const check = find({ ...complete, publishedPaths: ["/contacto"] }, "home")!;
    expect(check.status).toBe("todo");
    expect(check.blocking).toBe(true);
  });

  it("cuenta cuántas legales faltan y las nombra", () => {
    const check = find({ ...complete, publishedPaths: ["/"] }, "legal")!;
    expect(check.label).toContain("3");
    expect(check.detail).toContain("aviso-legal");
    expect(check.blocking).toBe(true);
  });

  it("los datos de empresa incompletos bloquean, porque los legales salen con huecos", () => {
    const check = find({ ...complete, business: { legalName: "X" } }, "business")!;
    expect(check.status).toBe("todo");
    expect(check.blocking).toBe(true);
  });

  it("un formulario publicado sin correo de contacto es el peor caso", () => {
    // El visitante envía y cree que le han oído.
    const check = find({ ...complete, contactEmail: "" }, "contact-email")!;
    expect(check.status).toBe("todo");
    expect(check.blocking).toBe(true);
    expect(check.detail).toContain("nadie se enterará");
  });

  it("sin clave de Resend el aviso no puede salir", () => {
    const check = find({ ...complete, integrations: {} }, "resend")!;
    expect(check.status).toBe("todo");
    expect(check.blocking).toBe(true);
  });

  it("las comprobaciones de correo no aparecen si no hay formulario", () => {
    const checks = buildChecklist({ ...complete, hasContactForm: false, contactEmail: "" });
    expect(checks.find((c) => c.id === "contact-email")).toBeUndefined();
    expect(checks.find((c) => c.id === "resend")).toBeUndefined();
    // Y en su lugar avisa de que falta el formulario, sin bloquear.
    const missing = checks.find((c) => c.id === "contact-form")!;
    expect(missing.status).toBe("warn");
    expect(missing.blocking).toBe(false);
  });

  it("una cabecera sin menú bloquea: no hay forma de navegar", () => {
    expect(find({ ...complete, mainMenuItems: 0 }, "menu")!.blocking).toBe(true);
  });

  it("una página publicada y vacía bloquea", () => {
    const check = find({ ...complete, emptyPages: ["/servicios"] }, "empty-pages")!;
    expect(check.status).toBe("todo");
    expect(check.detail).toContain("/servicios");
  });
});

describe("los avisos", () => {
  it("legales publicadas pero fuera del pie no bloquea, pero se dice", () => {
    const check = find({ ...complete, legalMenuItems: 0 }, "legal-menu")!;
    expect(check.status).toBe("warn");
    expect(check.blocking).toBe(false);
  });

  it("falta de logo y favicon se nombra en singular o en plural según toque", () => {
    expect(find({ ...complete, faviconUrl: "" }, "branding")!.label).toBe("Falta el favicon");
    expect(find({ ...complete, logoUrl: "" }, "branding")!.label).toBe("Falta el logo");
    expect(find({ ...complete, logoUrl: "", faviconUrl: "" }, "branding")!.label).toBe(
      "Falta el logo y el favicon"
    );
  });

  it("las páginas sin descripción se listan, sin volcarlas todas", () => {
    const many = ["/a", "/b", "/c", "/d", "/e"];
    const check = find({ ...complete, pagesWithoutDescription: many }, "descriptions")!;
    expect(check.label).toContain("5");
    expect(check.detail).toContain("y 2 más");
  });

  it("las imágenes sin alt y sin dimensiones son avisos separados", () => {
    const checks = buildChecklist({ ...complete, imagesWithoutAlt: 3, imagesWithoutDimensions: 2 });
    expect(checks.find((c) => c.id === "alt")!.label).toContain("3");
    expect(checks.find((c) => c.id === "dimensions")!.label).toContain("2");
  });

  it("Turnstile sólo se echa en falta si hay formulario", () => {
    expect(find({ ...complete, integrations: { resendApiKey: "re_x" } }, "turnstile")).toBeDefined();
    const noForm = buildChecklist({ ...complete, hasContactForm: false, integrations: {} });
    expect(noForm.find((c) => c.id === "turnstile")).toBeUndefined();
  });

  it("con trackers configurados confirma que el consentimiento los gobierna", () => {
    const check = find({ ...complete, analytics: { ga4: "G-X" } }, "consent")!;
    expect(check.status).toBe("ok");
  });

  it("sin trackers no aparece la comprobación de consentimiento", () => {
    expect(find(complete, "consent")).toBeUndefined();
  });
});

describe("summarise", () => {
  it("un aviso no impide estar listo: es una mejora, no un error de entrega", () => {
    // Si contaran igual, la insignia no se pondría verde nunca.
    const summary = summarise(buildChecklist({ ...complete, imagesWithoutAlt: 5 }));
    expect(summary.warnings).toBeGreaterThan(0);
    expect(summary.blockers).toBe(0);
    expect(summary.ready).toBe(true);
  });

  it("un bloqueante impide estar listo", () => {
    const summary = summarise(buildChecklist({ ...complete, mainMenuItems: 0 }));
    expect(summary.ready).toBe(false);
    expect(summary.blockers).toBe(1);
  });

  it("el progreso baja al acumular pendientes", () => {
    const bad = summarise(buildChecklist({
      ...complete, publishedPaths: [], business: {}, mainMenuItems: 0, legalMenuItems: 0,
      contactEmail: "", integrations: {}, logoUrl: "", faviconUrl: "", siteName: "",
    }));
    expect(bad.progress).toBeLessThan(30);
    expect(bad.ready).toBe(false);
  });

  it("una lista vacía no divide por cero", () => {
    expect(summarise([]).progress).toBe(100);
  });
});
