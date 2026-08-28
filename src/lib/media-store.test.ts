import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { r2Store, resolveMediaStore, LOCAL_DIR, LOCAL_PREFIX } from "./media-store";

/**
 * Dónde acaban los archivos subidos.
 *
 * El fallo que trajo esto aquí: en `astro dev` no hay binding de R2 —el adaptador de Node no
 * tiene bindings de Cloudflare— así que **toda** subida respondía «R2 bucket not configured»
 * con un 500 pelado. En la práctica significaba que no se podía montar un sitio en local,
 * porque lo primero que necesita cualquiera es subir su logo.
 */

describe("elegir almacén", () => {
  it("R2 manda cuando hay binding", async () => {
    const bucket = { put: async () => {}, delete: async () => {} };
    const result = await resolveMediaStore({
      R2_BUCKET: bucket,
      R2_PUBLIC_URL: "https://media.cliente.es",
    });
    expect(result.store?.kind).toBe("r2");
  });

  it("con bucket y sin URL pública se para, en vez de caer al disco", async () => {
    /*
     * La guarda que evita un fallo silencioso caro.
     *
     * Caer al disco aquí escondería un despliegue mal configurado hasta que alguien se
     * preguntara por qué las imágenes de un cliente desaparecen en cada despliegue: en Workers
     * ese disco no persiste, y en Node se pierde con el contenedor.
     */
    const result = await resolveMediaStore({ R2_BUCKET: { put: async () => {}, delete: async () => {} } });
    expect(result.store).toBeNull();
    if (!result.store) expect(result.reason).toMatch(/R2_PUBLIC_URL/);
  });

  it("sin binding cae al disco, que es el caso de desarrollo", async () => {
    const result = await resolveMediaStore({});
    expect(result.store?.kind).toBe("local");
  });
});

describe("las URL", () => {
  it("R2 usa la base del entorno y no duplica la barra", () => {
    const store = r2Store({ put: async () => {}, delete: async () => {} }, "https://media.cliente.es/");
    expect(store.urlFor("site_default/media_abc.png")).toBe(
      "https://media.cliente.es/site_default/media_abc.png"
    );
  });

  it("en local la URL es relativa al propio origen", async () => {
    const { store } = await resolveMediaStore({});
    expect(store!.urlFor("site_default/media_abc.png")).toBe(
      `${LOCAL_PREFIX}/site_default/media_abc.png`
    );
  });

  it("y el id se sigue pudiendo leer de la ruta relativa", async () => {
    // `mediaIdFromUrl` es lo que recupera el alt y las dimensiones al renderizar. Si la URL
    // local no fuera legible por él, cada imagen subida en desarrollo saldría sin alt y
    // moviendo la página al cargar.
    const { mediaIdFromUrl } = await import("./media-url");
    expect(mediaIdFromUrl(`${LOCAL_PREFIX}/site_default/media_abc123.png`)).toBe("media_abc123");
  });
});

describe("el almacén de disco", () => {
  let previous: string;
  let dir: string;

  beforeEach(() => {
    // `LOCAL_DIR` es relativo al directorio de trabajo, así que la prueba se hace desde uno
    // temporal en vez de escribir en `public/` del proyecto.
    dir = mkdtempSync(join(tmpdir(), "sastre-media-"));
    previous = process.cwd();
    process.chdir(dir);
  });
  afterEach(() => {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  });

  it("crea el directorio del sitio al guardar", async () => {
    // La clave lleva el sitio dentro, así que la primera subida de cada inquilino estrena
    // directorio. Sin `mkdir -p` fallaba con un error que no decía que fuera eso.
    const { store } = await resolveMediaStore({});
    const bytes = new TextEncoder().encode("<svg/>").buffer as ArrayBuffer;
    await store!.put("site_nuevo/media_x.svg", bytes, "image/svg+xml");

    const written = join(LOCAL_DIR, "site_nuevo", "media_x.svg");
    expect(existsSync(written)).toBe(true);
    expect(readFileSync(written, "utf8")).toBe("<svg/>");
  });

  it("borra", async () => {
    const { store } = await resolveMediaStore({});
    await store!.put("s/media_y.png", new Uint8Array([1, 2, 3]).buffer as ArrayBuffer, "image/png");
    await store!.remove("s/media_y.png");
    expect(existsSync(join(LOCAL_DIR, "s", "media_y.png"))).toBe(false);
  });

  it("borrar algo que no está no falla", async () => {
    // Borrar dos veces la misma fila no puede reventar la segunda: la fila ya no está y el
    // archivo tampoco, que es exactamente el estado que se pedía.
    const { store } = await resolveMediaStore({});
    mkdirSync(LOCAL_DIR, { recursive: true });
    await expect(store!.remove("s/no_existe.png")).resolves.toBeUndefined();
  });
});

describe("nunca disco en Workers", () => {
  const original = globalThis.navigator;

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "navigator", { value: original, configurable: true });
  });

  it("en Workers sin R2 no se inventa un almacén: dice qué falta", async () => {
    /*
     * «¿Se puede importar node:fs?» no sirve como detección, y por eso este test existe.
     *
     * Con `nodejs_compat` el bundler mete un polirrelleno de `node:fs/promises`: el import
     * tiene éxito y sus funciones fallan al llamarlas. Sin esta comprobación, un despliegue de
     * Workers sin R2 configurado devolvería un almacén que parece bueno y revienta al escribir
     * el primer archivo, en lugar de decir qué variable falta.
     */
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Cloudflare-Workers" },
      configurable: true,
    });

    const result = await resolveMediaStore({});
    expect(result.store).toBeNull();
    if (!result.store) expect(result.reason).toMatch(/R2_BUCKET/);
  });

  it("pero en Workers con R2 sigue funcionando", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Cloudflare-Workers" },
      configurable: true,
    });

    const result = await resolveMediaStore({
      R2_BUCKET: { put: async () => {}, delete: async () => {} },
      R2_PUBLIC_URL: "https://media.cliente.es",
    });
    expect(result.store?.kind).toBe("r2");
  });
});
