import { describe, it, expect } from "vitest";
import { buildMeta, buildHreflang, absoluteUrl, robotsValue, ogLocale, clampDescription } from "./seo";

const base = {
  title: "Reformas de baño en Madrid",
  description: "Presupuesto en 24 horas, obra terminada en dos semanas.",
  url: "https://reformas.test/servicios/banos",
  siteName: "Reformas Ruiz",
};

const find = (tags: ReturnType<typeof buildMeta>, key: string) =>
  tags.find((t) => t.property === key || t.name === key)?.content;

describe("absoluteUrl", () => {
  it("resuelve una ruta relativa contra la página", () => {
    // Un og:image relativo simplemente no lo descarga ningún crawler, y es la causa más
    // común de que un enlace compartido no muestre vista previa.
    expect(absoluteUrl("/media/foto.jpg", base.url)).toBe("https://reformas.test/media/foto.jpg");
  });

  it("deja una absoluta como está", () => {
    expect(absoluteUrl("https://cdn.test/f.jpg", base.url)).toBe("https://cdn.test/f.jpg");
  });

  it("vacío o ilegible es undefined, no una URL inventada", () => {
    expect(absoluteUrl("", base.url)).toBeUndefined();
    expect(absoluteUrl("   ", base.url)).toBeUndefined();
    expect(absoluteUrl(undefined, base.url)).toBeUndefined();
  });
});

describe("robotsValue", () => {
  it("es positivo, no ausente", () => {
    // Sin etiqueta, que Google muestre imagen grande o sólo texto es decisión suya.
    expect(robotsValue(false)).toContain("max-image-preview:large");
    expect(robotsValue(false)).toContain("index, follow");
  });

  it("noindex manda", () => {
    expect(robotsValue(true)).toBe("noindex, nofollow");
  });
});

describe("ogLocale", () => {
  it("convierte el idioma suelto a la forma que OG entiende", () => {
    expect(ogLocale("es")).toBe("es_ES");
    expect(ogLocale("ca")).toBe("ca_ES");
    expect(ogLocale("en")).toBe("en_US");
  });

  it("respeta uno ya completo", () => {
    expect(ogLocale("es-MX")).toBe("es_MX");
    expect(ogLocale("pt_BR")).toBe("pt_BR");
  });

  it("sin idioma asume castellano", () => {
    expect(ogLocale(undefined)).toBe("es_ES");
  });
});

describe("clampDescription", () => {
  it("recorta donde el resultado de búsqueda corta igual", () => {
    const long = "x".repeat(400);
    expect(clampDescription(long)!.length).toBe(320);
    expect(clampDescription(long)!.endsWith("…")).toBe(true);
  });

  it("una corta no se toca", () => {
    expect(clampDescription("Hola")).toBe("Hola");
  });

  it("vacía es undefined, para no emitir una etiqueta sin contenido", () => {
    expect(clampDescription("   ")).toBeUndefined();
  });
});

describe("buildMeta", () => {
  it("emite el Open Graph completo, no sólo el título", () => {
    const tags = buildMeta(base);
    for (const key of ["og:type", "og:title", "og:url", "og:site_name", "og:locale", "og:description"]) {
      expect(find(tags, key), key).toBeTruthy();
    }
  });

  it("la tarjeta de Twitter es grande sólo si hay imagen que agrandar", () => {
    expect(find(buildMeta(base), "twitter:card")).toBe("summary");
    expect(find(buildMeta({ ...base, image: "/f.jpg" }), "twitter:card")).toBe("summary_large_image");
  });

  it("la imagen sale absoluta en las dos redes", () => {
    const tags = buildMeta({ ...base, image: "/media/foto.jpg" });
    expect(find(tags, "og:image")).toBe("https://reformas.test/media/foto.jpg");
    expect(find(tags, "twitter:image")).toBe("https://reformas.test/media/foto.jpg");
  });

  it("el alt de la imagen cae al título si no se da", () => {
    const tags = buildMeta({ ...base, image: "/f.jpg" });
    expect(find(tags, "og:image:alt")).toBe(base.title);
  });

  it("og:url respeta el canonical cuando la página duplica a otra", () => {
    const tags = buildMeta({ ...base, canonical: "https://reformas.test/servicios" });
    expect(find(tags, "og:url")).toBe("https://reformas.test/servicios");
  });

  it("las fechas sólo se emiten en un artículo", () => {
    const article = buildMeta({ ...base, type: "article", publishedAt: "2026-08-01T10:00:00.000Z" });
    expect(find(article, "article:published_time")).toBe("2026-08-01T10:00:00.000Z");
    const page = buildMeta({ ...base, publishedAt: "2026-08-01T10:00:00.000Z" });
    expect(find(page, "article:published_time")).toBeUndefined();
  });

  it("normaliza el handle de Twitter, venga como venga", () => {
    for (const input of ["reformas", "@reformas", "https://twitter.com/reformas", "https://x.com/reformas/"]) {
      expect(find(buildMeta({ ...base, twitterSite: input }), "twitter:site"), input).toBe("@reformas");
    }
  });

  it("un handle vacío no emite la etiqueta", () => {
    expect(find(buildMeta({ ...base, twitterSite: "  " }), "twitter:site")).toBeUndefined();
  });

  it("noindex se refleja en robots", () => {
    expect(find(buildMeta({ ...base, noindex: true }), "robots")).toBe("noindex, nofollow");
  });

  it("sin descripción no emite etiquetas vacías", () => {
    const tags = buildMeta({ ...base, description: undefined });
    expect(find(tags, "description")).toBeUndefined();
    expect(find(tags, "og:description")).toBeUndefined();
    expect(find(tags, "twitter:description")).toBeUndefined();
  });
});

describe("buildHreflang", () => {
  const links = [
    { locale: "es", path: "/servicios" },
    { locale: "en", path: "/en/services" },
  ];

  it("incluye la autorreferencia y x-default", () => {
    // Google ignora un conjunto donde la página no se apunta a sí misma, que es la forma
    // más habitual de que un bloque hreflang aparentemente correcto no haga nada.
    const out = buildHreflang(links, "https://reformas.test", "es");
    expect(out.map((l) => l.hreflang)).toEqual(["es", "en", "x-default"]);
    expect(out.find((l) => l.hreflang === "x-default")!.href).toBe("https://reformas.test/servicios");
  });

  it("un solo idioma no genera nada: hreflang de uno no significa nada", () => {
    expect(buildHreflang([links[0]], "https://reformas.test", "es")).toEqual([]);
    expect(buildHreflang([], "https://reformas.test")).toEqual([]);
  });

  it("x-default cae al primero si el idioma por defecto no está entre ellos", () => {
    const out = buildHreflang(links, "https://reformas.test", "fr");
    expect(out.find((l) => l.hreflang === "x-default")!.href).toContain("/servicios");
  });

  it("las URLs salen absolutas", () => {
    for (const link of buildHreflang(links, "https://reformas.test", "es")) {
      expect(link.href.startsWith("https://")).toBe(true);
    }
  });
});
