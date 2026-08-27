import { describe, it, expect } from "vitest";
import { readMenu, referencedNodeIds, resolveMenu, isCurrent, type SiteMenus } from "./menus";

const menus: SiteMenus = {
  main: [
    { label: "Inicio", nodeId: "n_home" },
    { label: "Blog", nodeId: "n_blog" },
    { label: "Manual", url: "https://ejemplo.test/manual" },
    { label: "Precios", url: "#precios" },
  ],
  legal: [{ label: "Aviso legal", nodeId: "n_legal" }],
};
const paths = new Map([["n_home", "/"], ["n_blog", "/blog"], ["n_legal", "/aviso-legal"]]);

describe("readMenu", () => {
  it("lee un menú existente", () => {
    expect(readMenu(menus, "main")).toHaveLength(4);
  });

  it("devuelve lista vacía para un menú que no existe o basura", () => {
    expect(readMenu(menus, "footer")).toEqual([]);
    expect(readMenu(null, "main")).toEqual([]);
    expect(readMenu("texto", "main")).toEqual([]);
    expect(readMenu({ main: "no es lista" }, "main")).toEqual([]);
  });

  it("descarta entradas sin etiqueta, que no se podrían pulsar", () => {
    expect(readMenu({ main: [{ label: "" }, { label: "  " }, { url: "/x" }, { label: "Vale", url: "/x" }] }, "main"))
      .toEqual([{ label: "Vale", url: "/x" }]);
  });
});

describe("referencedNodeIds", () => {
  it("junta los ids de todos los menús, sin repetir", () => {
    expect(referencedNodeIds(menus).sort()).toEqual(["n_blog", "n_home", "n_legal"]);
  });

  it("no devuelve nada cuando ningún menú apunta a contenido", () => {
    // Sirve para saltarse la consulta por completo en ese caso.
    expect(referencedNodeIds({ main: [{ label: "Externo", url: "https://x.test" }] })).toEqual([]);
    expect(referencedNodeIds({})).toEqual([]);
  });
});

describe("resolveMenu", () => {
  it("resuelve nodos a su ruta actual", () => {
    // Guardar el id y no la ruta es lo que hace que renombrar un slug no rompa el menú.
    const [inicio, blog] = resolveMenu(menus, "main", paths);
    expect(inicio).toEqual({ label: "Inicio", href: "/", external: false });
    expect(blog.href).toBe("/blog");
  });

  it("marca como externos los enlaces que salen del sitio", () => {
    const items = resolveMenu(menus, "main", paths);
    expect(items.find((i) => i.label === "Manual")?.external).toBe(true);
    expect(items.find((i) => i.label === "Precios")?.external).toBe(false);
  });

  it("descarta el enlace a un nodo borrado en vez de dejar un 404 en todas las páginas", () => {
    const roto: SiteMenus = { main: [{ label: "Fantasma", nodeId: "n_no_existe" }] };
    expect(resolveMenu(roto, "main", paths)).toEqual([]);
  });

  it("conserva el orden del array", () => {
    expect(resolveMenu(menus, "main", paths).map((i) => i.label))
      .toEqual(["Inicio", "Blog", "Manual", "Precios"]);
  });
});

describe("isCurrent", () => {
  it("marca la página actual y sus hijas", () => {
    expect(isCurrent("/blog", "/blog")).toBe(true);
    expect(isCurrent("/blog", "/blog/un-post")).toBe(true);
  });

  it("no marca la home en todas las páginas", () => {
    // Con un startsWith ingenuo, "/" coincidiría con todo.
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/", "/contacto")).toBe(false);
  });

  it("no confunde rutas que comparten prefijo", () => {
    expect(isCurrent("/blog", "/blogueros")).toBe(false);
  });

  it("nunca marca anclas ni enlaces externos", () => {
    expect(isCurrent("#precios", "/")).toBe(false);
    expect(isCurrent("https://x.test", "/")).toBe(false);
  });
});
