import { describe, it, expect } from "vitest";
import { computePath, slugify, generateId } from "./id";

describe("slugify", () => {
  it("strips Spanish accents instead of dropping the letters", () => {
    expect(slugify("Sobre nosotros")).toBe("sobre-nosotros");
    expect(slugify("Diseño gráfico")).toBe("diseno-grafico");
    expect(slugify("Año 2026")).toBe("ano-2026");
  });

  it("collapses runs of separators and trims the edges", () => {
    expect(slugify("  ¡Hola,   mundo!  ")).toBe("hola-mundo");
    expect(slugify("a---b")).toBe("a-b");
  });
});

describe("generateId", () => {
  it("prefixes the id so a bare string says what it identifies", () => {
    expect(generateId("node")).toMatch(/^node_[a-z0-9]+$/);
  });

  it("does not collide within a single tick", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId("n")));
    expect(ids.size).toBe(1000);
  });
});

describe("computePath", () => {
  const ES = "es";

  describe("at root level", () => {
    it("gives the default locale the bare path", () => {
      expect(computePath(null, "contacto", "es", ES)).toBe("/contacto");
    });

    it("namespaces every other locale under its code", () => {
      expect(computePath(null, "contact", "en", ES)).toBe("/en/contact");
    });

    it("lets two locales share a slug without colliding", () => {
      // This is the whole point: the unique index is (siteId, path).
      const es = computePath(null, "contacto", "es", ES);
      const en = computePath(null, "contacto", "en", ES);
      expect(es).not.toBe(en);
      expect([es, en]).toEqual(["/contacto", "/en/contacto"]);
    });
  });

  describe('the "index" slug', () => {
    it("is the root of the default locale, not a child of it", () => {
      // The wizard writes "/" for the home node; computePath has to agree or
      // recomputePaths would rename it to /index on the first drag.
      expect(computePath(null, "index", "es", ES)).toBe("/");
    });

    it("is the root of its own locale for a translation", () => {
      expect(computePath(null, "index", "en", ES)).toBe("/en");
    });

    it("is only special at root level", () => {
      // Nested, "index" is just a path segment: a node called index under /blog is
      // /blog/index, not /blog. Only the root of each locale has a home page.
      expect(computePath("/blog", "index", "es", ES)).toBe("/blog/index");
    });
  });

  describe("nested nodes", () => {
    it("appends to the parent path", () => {
      expect(computePath("/sobre-nosotros", "equipo", "es", ES)).toBe("/sobre-nosotros/equipo");
    });

    it("inherits the prefix the parent already carries, without doubling it", () => {
      expect(computePath("/en/about", "team", "en", ES)).toBe("/en/about/team");
    });

    it("treats a parent of \"/\" as root", () => {
      expect(computePath("/", "blog", "es", ES)).toBe("/blog");
      expect(computePath("/", "blog", "en", ES)).toBe("/en/blog");
    });
  });

  describe("when locale information is missing", () => {
    // Older call sites pass two arguments. They must keep behaving as before.
    it("falls back to no prefix", () => {
      expect(computePath(null, "contacto")).toBe("/contacto");
      expect(computePath("/blog", "post")).toBe("/blog/post");
    });

    it("still resolves the home slug to root", () => {
      expect(computePath(null, "index")).toBe("/");
    });
  });

  it("never produces a double slash", () => {
    const cases: [string | null, string, string][] = [
      [null, "a", "es"],
      [null, "a", "en"],
      ["/", "a", "en"],
      ["/en", "a", "en"],
      ["/en/b", "a", "en"],
    ];
    for (const [parent, slug, locale] of cases) {
      expect(computePath(parent, slug, locale, ES)).not.toMatch(/\/\//);
    }
  });
});
