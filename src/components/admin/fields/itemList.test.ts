import { describe, it, expect } from "vitest";
import {
  withLocalIds,
  stripLocalIds,
  addItem,
  removeItem,
  moveItem,
  duplicateItem,
  replaceItem,
  asList,
} from "./itemList";

describe("withLocalIds / stripLocalIds", () => {
  it("round-trips: stripping undoes adding", () => {
    const items = [{ title: "a" }, { title: "b" }];
    expect(stripLocalIds(withLocalIds(items))).toEqual(items);
  });

  it("gives distinct ids, so :key does not collide between identical items", () => {
    const tagged = withLocalIds([{ t: "x" }, { t: "x" }]);
    expect(tagged[0]._lid).not.toBe(tagged[1]._lid);
  });

  it("does not mutate the input", () => {
    const items = [{ t: "a" }];
    withLocalIds(items);
    expect(items[0]).not.toHaveProperty("_lid");
  });
});

describe("addItem", () => {
  it("appends by default and inserts at an index when given one", () => {
    expect(addItem([1, 2], 3)).toEqual([1, 2, 3]);
    expect(addItem([1, 2], 9, 0)).toEqual([9, 1, 2]);
  });

  it("returns a new array", () => {
    const items = [1];
    expect(addItem(items, 2)).not.toBe(items);
  });
});

describe("removeItem", () => {
  it("removes by index", () => {
    expect(removeItem(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("ignores an index outside the list instead of corrupting it", () => {
    expect(removeItem(["a"], 5)).toEqual(["a"]);
    expect(removeItem(["a"], -1)).toEqual(["a"]);
  });
});

describe("moveItem", () => {
  it("moves forwards and backwards", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op when source and destination match", () => {
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("clamps the destination rather than dropping the item", () => {
    // A drop past the end used to lose the item entirely.
    expect(moveItem(["a", "b"], 0, 99)).toEqual(["b", "a"]);
    expect(moveItem(["a", "b"], 1, -5)).toEqual(["b", "a"]);
  });

  it("never changes the length", () => {
    const items = ["a", "b", "c", "d"];
    for (let from = 0; from < 4; from++) {
      for (let to = -2; to < 6; to++) {
        expect(moveItem(items, from, to)).toHaveLength(4);
      }
    }
  });
});

describe("duplicateItem", () => {
  it("inserts the copy right after the original", () => {
    expect(duplicateItem([{ t: "a" }, { t: "b" }], 0)).toEqual([
      { t: "a" },
      { t: "a" },
      { t: "b" },
    ]);
  });

  it("deep copies, so editing the copy does not change the original", () => {
    const items = [{ nested: { text: "uno" } }];
    const next = duplicateItem(items, 0);
    next[1].nested.text = "dos";
    expect(next[0].nested.text).toBe("uno");
  });
});

describe("replaceItem", () => {
  it("swaps one entry and leaves the rest", () => {
    expect(replaceItem(["a", "b"], 1, "z")).toEqual(["a", "z"]);
  });
});

describe("asList", () => {
  it("reads a stored list of objects", () => {
    expect(asList([{ a: 1 }])).toEqual([{ a: 1 }]);
  });

  it("returns an empty list for anything that is not one", () => {
    // A repeater field that was saved as "" before the type existed must not crash.
    expect(asList("")).toEqual([]);
    expect(asList(null)).toEqual([]);
    expect(asList({ a: 1 })).toEqual([]);
    expect(asList(undefined)).toEqual([]);
  });

  it("drops non-object entries", () => {
    expect(asList([{ a: 1 }, null, "x", 3])).toEqual([{ a: 1 }]);
  });
});
