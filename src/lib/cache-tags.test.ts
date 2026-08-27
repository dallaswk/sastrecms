import { describe, it, expect } from "vitest";
import {
  siteTag,
  nodeTag,
  typeTag,
  chromeTag,
  tagsForNode,
  tagsToPurgeForNode,
  tagsToPurgeForSettings,
  PUBLIC_CACHE,
} from "./cache-tags";

/**
 * El invariante que justifica el módulo: si la etiqueta con la que se guarda una página y la
 * que purga una edición se calculan en sitios distintos, divergen — y una página obsoleta es
 * silenciosa, se ve exactamente igual que una correcta.
 */
describe("emisión ↔ purga", () => {
  const siteId = "site_1";
  const nodeId = "node_post";
  const contentTypeId = "ct_post";

  it("editar un nodo purga una etiqueta con la que ese nodo está guardado", () => {
    const stored = tagsForNode({ siteId, nodeId, contentTypeId });
    const purged = tagsToPurgeForNode({ siteId, nodeId, contentTypeId });
    expect(purged.some((tag) => stored.includes(tag))).toBe(true);
  });

  it("publicar una entrada purga también su listado, no sólo su página", () => {
    // «Lo publiqué y la portada sigue mostrando las tres antiguas» es este fallo.
    const listing = tagsForNode({ siteId, nodeId: "node_blog", contentTypeId: "ct_page", referencedTypeIds: [contentTypeId] });
    const purged = tagsToPurgeForNode({ siteId, nodeId, contentTypeId });
    expect(purged).toContain(typeTag(contentTypeId));
    expect(listing).toContain(typeTag(contentTypeId));
  });

  it("mover un nodo purga el listado del padre antiguo y del nuevo", () => {
    const purged = tagsToPurgeForNode({
      siteId, nodeId, contentTypeId, previousParentId: "node_viejo", parentId: "node_nuevo",
    });
    expect(purged).toContain(nodeTag("node_viejo"));
    expect(purged).toContain(nodeTag("node_nuevo"));
  });

  it("cambiar ajustes alcanza a cualquier página, porque el chrome está en todas", () => {
    const page = tagsForNode({ siteId, nodeId: "node_cualquiera" });
    const purged = tagsToPurgeForSettings(siteId);
    expect(purged.some((tag) => page.includes(tag))).toBe(true);
  });
});

describe("tagsForNode", () => {
  it("una página lleva sus cuatro niveles de etiqueta", () => {
    const tags = tagsForNode({ siteId: "s", nodeId: "n", contentTypeId: "ct" });
    expect(tags).toEqual([siteTag("s"), chromeTag("s"), nodeTag("n"), typeTag("ct")]);
  });

  it("no repite etiquetas", () => {
    const tags = tagsForNode({
      siteId: "s", nodeId: "n", contentTypeId: "ct",
      referencedNodeIds: ["n", "m", "m"], referencedTypeIds: ["ct"],
    });
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("incluye los nodos que la página también pinta", () => {
    const tags = tagsForNode({ siteId: "s", nodeId: "n", referencedNodeIds: ["a", "b"] });
    expect(tags).toContain(nodeTag("a"));
    expect(tags).toContain(nodeTag("b"));
  });

  it("sin tipo de contenido no inventa una etiqueta vacía", () => {
    expect(tagsForNode({ siteId: "s", nodeId: "n" }).every((t) => !t.endsWith(":"))).toBe(true);
  });
});

describe("los prefijos no colisionan", () => {
  it("un id que vale para dos cosas no produce la misma etiqueta", () => {
    // Sin prefijo, node:abc y type:abc serían la misma cadena y una purga alcanzaría al otro.
    expect(nodeTag("abc")).not.toBe(typeTag("abc"));
    expect(siteTag("abc")).not.toBe(chromeTag("abc"));
  });
});

describe("PUBLIC_CACHE", () => {
  it("swr es mayor que maxAge, o el visitante espera la revalidación", () => {
    expect(PUBLIC_CACHE.swr).toBeGreaterThan(PUBLIC_CACHE.maxAge);
  });
});
