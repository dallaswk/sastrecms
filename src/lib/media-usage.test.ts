import { describe, it, expect } from "vitest";
import { findUrlInValue, urlMatchCandidates, describeUsage } from "./media-usage";

const URL = "https://media.test/site_default/media_abc.png";

describe("findUrlInValue", () => {
  it("finds an image field holding the url", () => {
    expect(findUrlInValue({ cover_image: URL }, URL)).toEqual([
      { field: "cover_image", kind: "exact" },
    ]);
  });

  it("reports the index of a gallery entry, so it can be checked", () => {
    expect(findUrlInValue({ gallery: ["otra.png", URL] }, URL)).toEqual([
      { field: "gallery[1]", kind: "exact" },
    ]);
  });

  it("distinguishes a url embedded in rich text from a field holding it", () => {
    // Tiptap cannot insert images, but the MCP surface writes fields raw, so an
    // <img src> can get into a body. Deleting the file breaks it just the same.
    const found = findUrlInValue({ body: `<p>x</p><img src="${URL}">` }, URL);
    expect(found).toEqual([{ field: "body", kind: "embedded" }]);
  });

  it("descends into repeater items and nested objects", () => {
    const fields = { sections: [{ type: "hero", data: { image: URL } }] };
    expect(findUrlInValue(fields, URL)).toEqual([
      { field: "sections[0].data.image", kind: "exact" },
    ]);
  });

  it("reports every hit, not just the first", () => {
    expect(findUrlInValue({ a: URL, b: [URL] }, URL)).toHaveLength(2);
  });

  it("says nothing when the url is absent", () => {
    expect(findUrlInValue({ cover_image: "https://media.test/otra.png" }, URL)).toEqual([]);
  });

  it("does not match a url that merely shares a prefix", () => {
    // media_abc.png vs media_abcdef.png — a naive substring check would report this.
    const longer = "https://media.test/site_default/media_abcdef.png";
    expect(findUrlInValue({ cover_image: longer }, URL)).toEqual([]);
  });

  it("survives nulls, numbers and empty objects", () => {
    expect(findUrlInValue({ a: null, b: 3, c: {}, d: [] }, URL)).toEqual([]);
    expect(findUrlInValue(null, URL)).toEqual([]);
    expect(findUrlInValue(undefined, URL)).toEqual([]);
  });
});

describe("urlMatchCandidates", () => {
  it("also matches the storage key, for rows written under an older public host", () => {
    expect(urlMatchCandidates(URL, "site_default/media_abc.png")).toEqual([
      URL,
      "site_default/media_abc.png",
    ]);
  });

  it("drops empties", () => {
    expect(urlMatchCandidates(URL, "")).toEqual([URL]);
  });
});

describe("describeUsage", () => {
  it("is explicit about published content, which is what breaks in public", () => {
    expect(describeUsage(0, 0)).toContain("No está enlazado");
    expect(describeUsage(1, 1)).toContain("está publicado");
    expect(describeUsage(3, 3)).toContain("todos están publicados");
    expect(describeUsage(3, 1)).toContain("1 de ellos publicados");
    expect(describeUsage(2, 0)).toContain("ninguno publicado");
  });

  it("does not claim the file is unused when it is the site logo", () => {
    // The summary sits above a list that includes settings entries; saying "not linked
    // anywhere" over a list containing the logo trains people to ignore the warning.
    const only = describeUsage(0, 0, 1);
    expect(only).toContain("ajustes del sitio");
    expect(only).not.toContain("No está enlazado en ningún contenido.");
  });

  it("mentions both when a file is in content and in settings", () => {
    const both = describeUsage(2, 2, 1);
    expect(both).toContain("2 contenidos lo enlazan");
    expect(both).toContain("ajustes");
  });
});
