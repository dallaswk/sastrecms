import { describe, it, expect } from "vitest";
import {
  readMenu,
  referencedNodeIds,
  resolveMenu,
  isCurrent,
  normalizeMenus,
  type SiteMenus,
} from "./menus";

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

describe("normalizeMenus", () => {
  it("guarda un menú vacío como ausente, no como []", () => {
    const out = normalizeMenus({ main: [{ label: "Inicio", nodeId: "n_home" }], footer: [] });
    expect(out.main).toHaveLength(1);
    expect("footer" in out).toBe(false);
    expect("legal" in out).toBe(false);
  });

  it("deja fuera las filas sin etiqueta y sin destino", () => {
    const out = normalizeMenus({
      main: [
        { label: "  ", nodeId: "n_home" },
        { label: "Vacío", url: "   " },
        { label: " Contacto ", url: " /contacto " },
      ],
    });
    expect(out.main).toEqual([{ label: "Contacto", url: "/contacto" }]);
  });

  it("la página gana a la URL, para que no quede ambiguo cuál se usa", () => {
    const out = normalizeMenus({ main: [{ label: "Blog", nodeId: "n_blog", url: "https://otro.test" }] });
    expect(out.main).toEqual([{ label: "Blog", nodeId: "n_blog" }]);
  });

  it("sobrevive a lo que no es un menú sin lanzar", () => {
    expect(normalizeMenus(null)).toEqual({});
    expect(normalizeMenus({ main: "no soy una lista" })).toEqual({});
    expect(normalizeMenus({ main: [null, 7, { label: "Ok", url: "/ok" }] })).toEqual({
      main: [{ label: "Ok", url: "/ok" }],
    });
  });

  it("es idempotente: normalizar lo ya guardado no lo cambia", () => {
    const once = normalizeMenus(menus);
    expect(normalizeMenus(once)).toEqual(once);
  });

  it("lo que normalizeMenus guarda es exactamente lo que resolveMenu sabe leer", () => {
    const out = normalizeMenus({
      main: [
        { label: "Inicio", nodeId: "n_home" },
        { label: "Fuera", url: "https://ejemplo.test" },
      ],
    });
    const resolved = resolveMenu(out, "main", new Map([["n_home", "/"]]));
    expect(resolved).toEqual([
      { label: "Inicio", href: "/", external: false },
      { label: "Fuera", href: "https://ejemplo.test", external: true },
    ]);
  });
});
