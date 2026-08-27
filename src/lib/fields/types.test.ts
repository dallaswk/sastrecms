import { describe, it, expect } from "vitest";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  emptyValueFor,
  emptyFieldsFor,
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
