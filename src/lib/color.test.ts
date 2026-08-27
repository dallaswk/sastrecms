import { describe, it, expect } from "vitest";
import { hexToOklch, themeColorValue } from "./color";

/** L% C H → números, para comparar con tolerancia. */
function parse(s: string | null) {
  if (!s) return null;
  const [l, c, h] = s.split(" ");
  return { l: parseFloat(l), c: parseFloat(c), h: parseFloat(h) };
}

describe("hexToOklch", () => {
  it("convierte blanco y negro a sus extremos", () => {
    expect(parse(hexToOklch("#ffffff"))).toMatchObject({ l: 100, c: 0 });
    expect(parse(hexToOklch("#000000"))).toMatchObject({ l: 0, c: 0 });
  });

  it("da a los grises croma cero y tono cero", () => {
    // Sin esto, atan2 sobre ruido de coma flotante inventa un tono en un color neutro.
    const grey = parse(hexToOklch("#808080"))!;
    expect(grey.c).toBeLessThan(0.001);
    expect(grey.h).toBe(0);
  });

  it("coincide con los valores conocidos de sRGB puro", () => {
    // Referencias de la especificación de OKLab.
    const red = parse(hexToOklch("#ff0000"))!;
    expect(red.l).toBeCloseTo(62.8, 0);
    expect(red.c).toBeCloseTo(0.2577, 2);
    expect(red.h).toBeCloseTo(29.23, 0);

    const green = parse(hexToOklch("#00ff00"))!;
    expect(green.l).toBeCloseTo(86.64, 0);
    expect(green.h).toBeCloseTo(142.5, 0);

    const blue = parse(hexToOklch("#0000ff"))!;
    expect(blue.l).toBeCloseTo(45.2, 0);
    expect(blue.h).toBeCloseTo(264.05, 0);
  });

  it("acepta la forma corta y con o sin almohadilla", () => {
    expect(hexToOklch("#fff")).toBe(hexToOklch("#ffffff"));
    expect(hexToOklch("ffffff")).toBe(hexToOklch("#ffffff"));
    expect(hexToOklch("  #FFF  ")).toBe(hexToOklch("#ffffff"));
  });

  it("devuelve null en vez de emitir una variable rota", () => {
    for (const bad of ["", "rojo", "#12", "#12345", "#gggggg", "1,2,3"]) {
      expect(hexToOklch(bad), bad).toBeNull();
    }
  });

  it("el tono siempre cae en [0, 360)", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#ff00ff", "#123456", "#fedcba"]) {
      const h = parse(hexToOklch(hex))!.h;
      expect(h, hex).toBeGreaterThanOrEqual(0);
      expect(h, hex).toBeLessThan(360);
    }
  });
});

describe("themeColorValue", () => {
  it("convierte hex", () => {
    expect(themeColorValue("#ffffff")).toBe(hexToOklch("#ffffff"));
  });

  it("deja pasar lo que ya viene en componentes OKLCH", () => {
    // El campo de texto junto al selector permite pegar el formato de daisyUI a mano.
    expect(themeColorValue("49.12% 0.3096 275.75")).toBe("49.12% 0.3096 275.75");
  });

  it("devuelve null para vacío o basura", () => {
    expect(themeColorValue("")).toBeNull();
    expect(themeColorValue("   ")).toBeNull();
    expect(themeColorValue("azul marino")).toBeNull();
  });
});
