import { describe, it, expect } from "vitest";
import { mediaIdFromUrl, mediaIdsIn, aspectRatio, collectMediaUrls } from "./media-url";

describe("mediaIdFromUrl", () => {
  it("saca el id de una URL de R2 completa", () => {
    expect(mediaIdFromUrl("https://media.cliente.test/site_1/media_abc123.jpg")).toBe("media_abc123");
  });

  it("funciona con una ruta suelta, que es lo que a veces guarda un campo a mano", () => {
    expect(mediaIdFromUrl("/site_1/media_abc123.png")).toBe("media_abc123");
  });

  it("ignora query y fragmento", () => {
    expect(mediaIdFromUrl("https://m.test/s/media_abc.webp?v=2")).toBe("media_abc");
    expect(mediaIdFromUrl("https://m.test/s/media_abc.webp#x")).toBe("media_abc");
  });

  it("una URL externa no inventa un id", () => {
    expect(mediaIdFromUrl("https://unsplash.test/foto.jpg")).toBeNull();
    expect(mediaIdFromUrl("https://m.test/s/logo.svg")).toBeNull();
  });

  it("no lanza con basura", () => {
    for (const value of [null, undefined, "", "   ", 42, {}]) {
      expect(mediaIdFromUrl(value)).toBeNull();
    }
  });

  it("no confunde un id que aparece a mitad de la ruta con el del archivo", () => {
    // El id es el del nombre del archivo, no el de una carpeta que se llame igual.
    expect(mediaIdFromUrl("https://m.test/media_carpeta/media_real.jpg")).toBe("media_real");
  });
});

describe("mediaIdsIn", () => {
  it("deduplica, para que la página haga una sola consulta", () => {
    const ids = mediaIdsIn([
      "https://m.test/s/media_a.jpg",
      "https://m.test/s/media_a.jpg",
      "https://m.test/s/media_b.png",
      "https://externo.test/x.jpg",
      null,
    ]);
    expect(ids).toEqual(["media_a", "media_b"]);
  });
});

describe("aspectRatio", () => {
  it("devuelve la proporción intrínseca", () => {
    expect(aspectRatio(1600, 900)).toBe("1600 / 900");
  });

  it("sin dimensiones no adivina: reservar el hueco equivocado es peor que no reservarlo", () => {
    expect(aspectRatio(null, 900)).toBeNull();
    expect(aspectRatio(1600, undefined)).toBeNull();
    expect(aspectRatio(0, 0)).toBeNull();
    expect(aspectRatio(-1, 10)).toBeNull();
  });
});

describe("collectMediaUrls", () => {
  it("encuentra las URLs a cualquier profundidad", () => {
    const data = {
      title: "Hola",
      image: "https://m.test/s/media_hero.jpg",
      cards: [
        { icon: "https://m.test/s/media_a.png", text: "x" },
        { icon: "https://externo.test/b.png" },
      ],
      gallery: { items: ["https://m.test/s/media_b.webp"] },
    };
    expect(collectMediaUrls(data).sort()).toEqual([
      "https://m.test/s/media_a.png",
      "https://m.test/s/media_b.webp",
      "https://m.test/s/media_hero.jpg",
    ]);
  });

  it("no lanza ni se cuelga con una estructura absurdamente profunda", () => {
    // JSON de la base de datos: un agente o una importación mala puede anidar sin control, y
    // recursión sin tope convierte eso en un desbordamiento de pila en una página pública.
    let deep: any = "https://m.test/s/media_x.jpg";
    for (let i = 0; i < 200; i++) deep = { inner: deep };
    expect(() => collectMediaUrls(deep)).not.toThrow();
    expect(collectMediaUrls(deep)).toEqual([]);
  });

  it("no lanza con basura", () => {
    expect(collectMediaUrls(null)).toEqual([]);
    expect(collectMediaUrls(42)).toEqual([]);
  });
});
