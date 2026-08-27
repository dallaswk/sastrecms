import { describe, it, expect } from "vitest";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  emptyValueFor,
  emptyFieldsFor,
  initialValueFor,
  type FieldDefinition,
} from "./types";

const field = (over: Partial<FieldDefinition>): FieldDefinition => ({
  key: "x",
  label: "X",
  type: "text",
  ...over,
});

describe("FIELD_TYPES", () => {
  it("has a label for every type", () => {
    // TypeScript already enforces this on the Record; the test covers the runtime
    // object, which is what the builder's <option> loop actually reads.
    for (const type of FIELD_TYPES) {
      expect(FIELD_TYPE_LABELS[type], `falta la etiqueta de "${type}"`).toBeTruthy();
    }
    expect(Object.keys(FIELD_TYPE_LABELS).sort()).toEqual([...FIELD_TYPES].sort());
  });

  it("has no duplicates", () => {
    expect(new Set(FIELD_TYPES).size).toBe(FIELD_TYPES.length);
  });
});

describe("emptyValueFor", () => {
  it("starts list-shaped fields as arrays, not empty strings", () => {
    // A sections field initialised to "" hands the sections editor a string.
    expect(emptyValueFor(field({ type: "sections" }))).toEqual([]);
    expect(emptyValueFor(field({ type: "gallery" }))).toEqual([]);
    expect(emptyValueFor(field({ type: "repeater" }))).toEqual([]);
  });

  it("starts a number as null so an empty field is not saved as 0", () => {
    expect(emptyValueFor(field({ type: "number" }))).toBeNull();
  });

  it("starts every text-like field as an empty string", () => {
    for (const type of ["text", "textarea", "richtext", "date", "select", "image", "relation"] as const) {
      expect(emptyValueFor(field({ type }))).toBe("");
    }
  });

  it("covers every declared type", () => {
    for (const type of FIELD_TYPES) {
      expect(() => emptyValueFor(field({ type }))).not.toThrow();
    }
  });
});

describe("emptyFieldsFor", () => {
  it("keys by field key", () => {
    expect(
      emptyFieldsFor([field({ key: "body", type: "richtext" }), field({ key: "fotos", type: "gallery" })])
    ).toEqual({ body: "", fotos: [] });
  });
});

describe("initialValueFor", () => {
  it("keeps what is stored", () => {
    expect(initialValueFor(field({ type: "text" }), "hola")).toBe("hola");
    expect(initialValueFor(field({ type: "richtext" }), "<p>x</p>")).toBe("<p>x</p>");
    expect(initialValueFor(field({ type: "gallery" }), ["a", "b"])).toEqual(["a", "b"]);
  });

  it("falls back to the empty value when nothing is stored", () => {
    expect(initialValueFor(field({ type: "gallery" }), undefined)).toEqual([]);
    expect(initialValueFor(field({ type: "repeater" }), null)).toEqual([]);
    expect(initialValueFor(field({ type: "text" }), undefined)).toBe("");
  });

  it("coerces a wrong shape towards something the editor can render", () => {
    // A field whose type changed, or one an agent wrote through MCP, can hold anything.
    // Handing a string to the gallery editor is how you get a blank form.
    expect(initialValueFor(field({ type: "gallery" }), "una-sola.png")).toEqual([]);
    expect(initialValueFor(field({ type: "sections" }), "vaya")).toEqual([]);
  });

  it("starts an unset number at null rather than an empty string", () => {
    // Deliberate change from the previous inline rule: "" is not a number, and
    // TextField emits null when the input is cleared, so both ends now agree.
    expect(initialValueFor(field({ type: "number" }), undefined)).toBeNull();
    expect(initialValueFor(field({ type: "number" }), "")).toBeNull();
    expect(initialValueFor(field({ type: "number" }), "42")).toBe(42);
    expect(initialValueFor(field({ type: "number" }), 0)).toBe(0);
  });

  it("keeps a stored zero, which is a real value", () => {
    expect(initialValueFor(field({ type: "number" }), 0)).toBe(0);
  });
});

describe("guarda de regresión del refactor de campos", () => {
  it("un post existente entra al editor con exactamente lo que hay guardado", () => {
    // El refactor de B1 movió la inicialización de NodeForm aquí. Si esta regla cambia,
    // abrir y guardar un contenido sin tocarlo reescribiría su JSON en silencio.
    const schema: FieldDefinition[] = [
      { key: "excerpt", label: "Extracto", type: "textarea" },
      { key: "cover_image", label: "Portada", type: "image" },
      { key: "gallery", label: "Galería", type: "gallery" },
      { key: "year", label: "Año", type: "number" },
      { key: "body", label: "Contenido", type: "richtext" },
    ];
    const stored = {
      excerpt: "Un extracto",
      cover_image: "https://media.test/a.png",
      gallery: ["https://media.test/b.png", "https://media.test/c.png"],
      year: 2026,
      body: "<p>Cuerpo</p>",
    };

    const loaded = Object.fromEntries(
      schema.map((f) => [f.key, initialValueFor(f, stored[f.key as keyof typeof stored])])
    );

    expect(loaded).toEqual(stored);
  });

  it("un contenido sin ningún campo guardado no inventa valores raros", () => {
    const schema: FieldDefinition[] = [
      { key: "body", label: "Contenido", type: "richtext" },
      { key: "fotos", label: "Fotos", type: "gallery" },
    ];
    const loaded = Object.fromEntries(schema.map((f) => [f.key, initialValueFor(f, undefined)]));
    expect(loaded).toEqual({ body: "", fotos: [] });
  });
});
