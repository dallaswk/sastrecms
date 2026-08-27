import { describe, it, expect } from "vitest";
import {
  parseNodes,
  normalize,
  flatten,
  baselineOf,
  diffAgainst,
  reparentedIds,
  recomputePaths,
  clone,
  type TreeNode,
} from "./nodeTreeContext";
import { computePath } from "@lib/id";

function node(partial: Partial<TreeNode> & { id: string }): TreeNode {
  return {
    title: partial.id,
    slug: partial.id,
    path: `/${partial.id}`,
    status: "published",
    locale: "es",
    position: 0,
    parentId: null,
    contentTypeId: "ct_page",
    children: [],
    ...partial,
  };
}

/** about > [team, history], blog > [post] */
function sampleTree(): TreeNode[] {
  return [
    node({
      id: "about",
      path: "/about",
      children: [
        node({ id: "team", parentId: "about", path: "/about/team" }),
        node({ id: "history", parentId: "about", path: "/about/history", position: 1 }),
      ],
    }),
    node({ id: "blog", path: "/blog", position: 1, children: [
      node({ id: "post", parentId: "blog", path: "/blog/post" }),
    ]}),
  ];
}

describe("normalize / parseNodes", () => {
  it("gives every node a real children array so empty branches accept drops", () => {
    const [n] = normalize([{ id: "a" }]);
    expect(n.children).toEqual([]);
  });

  it("defaults a missing parentId to null rather than undefined", () => {
    const [n] = normalize([{ id: "a" }]);
    expect(n.parentId).toBeNull();
  });

  it("returns an empty tree for anything that is not an array", () => {
    expect(normalize(null)).toEqual([]);
    expect(normalize({ id: "a" })).toEqual([]);
  });

  it("survives malformed JSON instead of throwing during hydration", () => {
    expect(parseNodes("not json")).toEqual([]);
    expect(parseNodes('[{"id":"a"}]')).toHaveLength(1);
  });
});

describe("flatten", () => {
  it("numbers positions by array order, per level", () => {
    expect(flatten(sampleTree())).toEqual([
      { id: "about", position: 0, parentId: null },
      { id: "team", position: 0, parentId: "about" },
      { id: "history", position: 1, parentId: "about" },
      { id: "blog", position: 1, parentId: null },
      { id: "post", position: 0, parentId: "blog" },
    ]);
  });
});

describe("diffAgainst", () => {
  it("sends nothing when the tree has not moved", () => {
    const tree = sampleTree();
    expect(diffAgainst(baselineOf(tree), tree)).toEqual([]);
  });

  it("sends only the nodes that actually moved", () => {
    // Sending the whole tree would make reorder demand "edit" on every content type,
    // so an editor scoped to one type could never reorder anything.
    const tree = sampleTree();
    const baseline = baselineOf(tree);
    tree.reverse(); // swap the two roots

    expect(diffAgainst(baseline, tree).map((i) => i.id).sort()).toEqual(["about", "blog"]);
  });

  it("reports a node that changed parent", () => {
    const tree = sampleTree();
    const baseline = baselineOf(tree);
    const [team] = tree[0].children.splice(0, 1);
    tree[1].children.push(team);

    const moved = diffAgainst(baseline, tree);
    expect(moved).toContainEqual({ id: "team", position: 1, parentId: "blog" });
    // history slid up from position 1 to 0, so it moved too
    expect(moved).toContainEqual({ id: "history", position: 0, parentId: "about" });
  });

  it("treats a node absent from the baseline as changed", () => {
    const tree = sampleTree();
    tree.push(node({ id: "nuevo", position: 2 }));
    expect(diffAgainst(baselineOf(sampleTree()), tree).map((i) => i.id)).toContain("nuevo");
  });
});

describe("reparentedIds", () => {
  it("ignores a node that only changed position", () => {
    const tree = sampleTree();
    const baseline = baselineOf(tree);
    tree.reverse();
    expect(reparentedIds(baseline, tree).size).toBe(0);
  });

  it("catches a node that changed parent", () => {
    const tree = sampleTree();
    const baseline = baselineOf(tree);
    const [team] = tree[0].children.splice(0, 1);
    tree[1].children.push(team);
    expect([...reparentedIds(baseline, tree)]).toEqual(["team"]);
  });
});

describe("recomputePaths", () => {
  it("leaves untouched branches alone", () => {
    // A blanket recompute would rewrite the home node, which lives at "/" with slug
    // "index", and every unrelated subtree along with it.
    const tree = sampleTree();
    tree.unshift(node({ id: "home", slug: "index", path: "/" }));
    recomputePaths(tree, "", new Set(), "es");
    expect(tree.map((n) => n.path)).toEqual(["/", "/about", "/blog"]);
  });

  it("rewrites a moved node and its whole subtree", () => {
    const tree = sampleTree();
    const [about] = tree.splice(0, 1);
    tree[0].children.push(about);

    recomputePaths(tree, "", new Set(["about"]), "es");

    expect(about.path).toBe("/blog/about");
    expect(about.children.map((c) => c.path)).toEqual([
      "/blog/about/team",
      "/blog/about/history",
    ]);
  });

  it("reapplies the locale prefix when a translated node returns to root", () => {
    const en = node({ id: "team", slug: "team", locale: "en", path: "/en/about/team" });
    const tree = [en];
    recomputePaths(tree, "", new Set(["team"]), "es");
    expect(en.path).toBe("/en/team");
  });

  it("resolves a translated home to its locale root", () => {
    const home = node({ id: "home-en", slug: "index", locale: "en", path: "/x" });
    recomputePaths([home], "", new Set(["home-en"]), "es");
    expect(home.path).toBe("/en");
  });
});

/**
 * The tree renders paths the server never returns — reorder only answers { ok: true }.
 * If these two implementations drift, the admin shows routes that do not exist.
 */
describe("recomputePaths agrees with computePath", () => {
  const cases: { slug: string; locale: string; parentPath: string }[] = [
    { slug: "contacto", locale: "es", parentPath: "" },
    { slug: "contacto", locale: "en", parentPath: "" },
    { slug: "index", locale: "es", parentPath: "" },
    { slug: "index", locale: "en", parentPath: "" },
    { slug: "equipo", locale: "es", parentPath: "/sobre-nosotros" },
    { slug: "team", locale: "en", parentPath: "/en/about" },
  ];

  it.each(cases)("$locale /$slug under '$parentPath'", ({ slug, locale, parentPath }) => {
    const n = node({ id: "x", slug, locale, path: "/stale" });
    recomputePaths([n], parentPath, new Set(["x"]), "es");

    expect(n.path).toBe(computePath(parentPath || null, slug, locale, "es"));
  });
});

describe("clone", () => {
  it("deep copies, so a reverted move cannot alias the live tree", () => {
    const tree = sampleTree();
    const copy = clone(tree);
    copy[0].children[0].title = "cambiado";
    expect(tree[0].children[0].title).toBe("team");
  });
});
