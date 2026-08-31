import { describe, it, expect } from "vitest";
import {
  SITE_THEMES,
  THEME_LABELS,
  FONTS,
  CONTAINER_WIDTHS,
  TYPE_SCALES,
  DEFAULT_THEME,
  DEFAULT_FONT,
  DEFAULT_CONTAINER,
  DEFAULT_TYPE_SCALE,
  isSiteTheme,
  ADMIN_THEMES,
  getFont,
  googleFontsHref,
  buildThemeCss,
  themeFingerprint,
} from "./theme";
import { readFileSync } from "node:fs";
import { themeColorValue } from "./color";
import tailwindConfig from "../../tailwind.config";

/**
 * El invariante que motivó este módulo.
 *
 * El selector de Ajustes ofrecía los 32 temas de daisyUI mientras la configuración generaba
 * dos, así que 30 de las opciones no hacían nada y nada lo decía. Ahora las dos listas salen
 * del mismo array, y este test lo sujeta.
 */
describe("temas: una sola fuente", () => {
  it("lo que Tailwind compila para el sitio es exactamente lo que se ofrece", () => {
    // La configuración compila además los dos temas del backoffice, que son objetos y no
    // cadenas. Los del sitio son los que puede elegir un cliente, y son los que se comparan.
    const compiled = (tailwindConfig as any).daisyui.themes as unknown[];
    const siteNames = compiled.filter((t): t is string => typeof t === "string");
    expect([...siteNames].sort()).toEqual([...SITE_THEMES].sort());
  });

  it("los temas del backoffice se compilan, y no se ofrecen al sitio", () => {
    const compiled = (tailwindConfig as any).daisyui.themes as unknown[];
    const adminNames = compiled
      .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
      .flatMap((t) => Object.keys(t));
    expect(adminNames.sort()).toEqual([...ADMIN_THEMES].sort());
    // Un editor no debe poder ponerle al sitio de un cliente la paleta del panel.
    for (const name of adminNames) expect(isSiteTheme(name)).toBe(false);
  });

  it("cada tema tiene etiqueta en castellano", () => {
    for (const theme of SITE_THEMES) {
      expect(THEME_LABELS[theme], theme).toBeTruthy();
    }
  });

  it("el tema por defecto es uno de los compilados", () => {
    expect(isSiteTheme(DEFAULT_THEME)).toBe(true);
  });

  it("rechaza un tema que no se compila, para que no acabe en data-theme", () => {
    expect(isSiteTheme("cyberpunk")).toBe(false);
    expect(isSiteTheme("")).toBe(false);
    expect(isSiteTheme(null)).toBe(false);
  });
});

describe("fuentes", () => {
  it("las claves no se repiten", () => {
    const keys = FONTS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("toda fuente declara una pila con alternativa, nunca una familia sola", () => {
    for (const font of FONTS) {
      expect(font.stack, font.key).toContain(",");
    }
  });

  it("la fuente por defecto no hace peticiones externas", () => {
    const font = getFont(DEFAULT_FONT);
    expect(font.google).toBeUndefined();
  });

  it("una clave inventada cae a la primera en vez de romper la página", () => {
    expect(getFont("comic-sans-galactica").key).toBe(FONTS[0].key);
    expect(getFont(undefined).key).toBe(FONTS[0].key);
  });

  it("una sola petición a Google para las dos familias", () => {
    const href = googleFontsHref("playfair", "inter")!;
    expect(href.match(/family=/g)).toHaveLength(2);
    expect(href).toContain("display=swap");
  });

  it("no repite la familia cuando titular y texto son la misma", () => {
    expect(googleFontsHref("inter", "inter")!.match(/family=/g)).toHaveLength(1);
  });

  it("sin fuentes de Google no hay enlace que cargar", () => {
    expect(googleFontsHref("system", "system-serif")).toBeNull();
  });

  it("una sola de las dos ya justifica el enlace", () => {
    expect(googleFontsHref("playfair", "system")).toContain("Playfair");
  });
});

describe("buildThemeCss", () => {
  it("siempre define fuentes, ancho y escala, aunque el tema esté vacío", () => {
    const css = buildThemeCss({}, themeColorValue);
    for (const v of ["--font-heading", "--font-body", "--site-width", "--type-scale"]) {
      expect(css, v).toContain(v);
    }
  });

  it("convierte el hex del selector de color a los componentes OKLCH de daisyUI", () => {
    const css = buildThemeCss({ primaryColor: "#2F4B8F" }, themeColorValue);
    expect(css).toMatch(/--p: [\d.]+% [\d.]+ [\d.]+;/);
    // Escribir el hex tal cual dejaba el valor inválido y el selector no hacía nada.
    expect(css).not.toContain("#2F4B8F");
  });

  it("deriva el color de contraste, que daisyUI sólo calcula para sus propios temas", () => {
    const claro = buildThemeCss({ primaryColor: "#F5F5F5" }, themeColorValue);
    const oscuro = buildThemeCss({ primaryColor: "#101010" }, themeColorValue);
    expect(claro).toContain("--pc: 0% 0 0;");
    expect(oscuro).toContain("--pc: 100% 0 0;");
  });

  it("un color ilegible se omite en vez de emitir CSS roto", () => {
    const css = buildThemeCss({ primaryColor: "no soy un color" }, themeColorValue);
    expect(css).not.toContain("--p:");
    expect(css).toContain("--font-body");
  });

  it("el fondo base arrastra sus dos bandas, o base-200 se queda en el gris de daisyUI", () => {
    const css = buildThemeCss({ baseColor: "#FBF8F4" }, themeColorValue);
    const [, b1] = css.match(/--b1: ([\d.]+)%/)!;
    const [, b2] = css.match(/--b2: ([\d.]+)%/)!;
    const [, b3] = css.match(/--b3: ([\d.]+)%/)!;
    // Sobre un fondo claro las bandas se oscurecen, como en los temas de daisyUI.
    expect(Number(b2)).toBeLessThan(Number(b1));
    expect(Number(b3)).toBeLessThan(Number(b2));
  });

  it("las bandas conservan croma y tono: es el mismo color a distinta luz", () => {
    const css = buildThemeCss({ baseColor: "#FBF8F4" }, themeColorValue);
    const croma = [...css.matchAll(/--b[123]: [\d.]+% ([\d.]+) ([\d.]+);/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(croma).toHaveLength(3);
    expect(new Set(croma).size).toBe(1);
  });

  it("sobre un fondo oscuro las bandas se aclaran en vez de hundirse en negro", () => {
    const css = buildThemeCss({ baseColor: "#12100E" }, themeColorValue);
    const [, b1] = css.match(/--b1: ([\d.]+)%/)!;
    const [, b3] = css.match(/--b3: ([\d.]+)%/)!;
    expect(Number(b3)).toBeGreaterThan(Number(b1));
  });

  it("sin color base no se tocan las bandas: manda el tema elegido", () => {
    const css = buildThemeCss({ primaryColor: "#3F5D52" }, themeColorValue);
    expect(css).not.toContain("--b2:");
    expect(css).not.toContain("--b3:");
  });

  it("el radio pasa tal cual: no es un color", () => {
    expect(buildThemeCss({ borderRadius: "0.75rem" }, themeColorValue)).toContain(
      "--rounded-box: 0.75rem;"
    );
  });

  it("el ancho y la escala salen del registro, no del valor guardado", () => {
    const css = buildThemeCss({ containerWidth: "ancho", typeScale: "grande" }, themeColorValue);
    expect(css).toContain(`--site-width: ${CONTAINER_WIDTHS.find((c) => c.key === "ancho")!.value};`);
    expect(css).toContain(`--type-scale: ${TYPE_SCALES.find((t) => t.key === "grande")!.value};`);
  });

  it("un ancho inventado cae al normal", () => {
    const css = buildThemeCss({ containerWidth: "gigantesco" }, themeColorValue);
    const normal = CONTAINER_WIDTHS.find((c) => c.key === DEFAULT_CONTAINER)!.value;
    expect(css).toContain(`--site-width: ${normal};`);
  });

  it("no lanza con null", () => {
    expect(() => buildThemeCss(null, themeColorValue)).not.toThrow();
  });

  it("la escala por defecto existe en el registro", () => {
    expect(TYPE_SCALES.some((t) => t.key === DEFAULT_TYPE_SCALE)).toBe(true);
  });
});

describe("themeFingerprint", () => {
  it("el mismo tema da la misma huella, o la hoja de estilos no se cachearía nunca", () => {
    const theme = { primaryColor: "#123456", fontBody: "inter" };
    expect(themeFingerprint(theme)).toBe(themeFingerprint({ ...theme }));
  });

  it("cambiar un color cambia la URL, que es lo que hace visible el cambio", () => {
    expect(themeFingerprint({ primaryColor: "#123456" })).not.toBe(
      themeFingerprint({ primaryColor: "#123457" })
    );
  });

  it("es apta para una URL", () => {
    expect(themeFingerprint({ primaryColor: "#123456" })).toMatch(/^[a-z0-9]+$/);
  });

  it("no lanza con null ni undefined", () => {
    expect(themeFingerprint(null)).toBe(themeFingerprint(undefined));
  });
});

describe("la hoja del sitio gana a la de daisyUI", () => {
  /*
   * Sobre el fuente, porque lo que falla aquí es la cascada y eso no se puede montar en
   * una prueba de unidad: daisyUI declara la paleta en `[data-theme=<tema>]`, que empata
   * en especificidad con `:root`. Empatadas gana la última declarada, y cuál va última
   * depende de dónde inyecte la hoja el empaquetador —en desarrollo, al final del head, o
   * sea después. Con `:root` los colores del cliente se ignoraban en silencio mientras las
   * tipografías, que no compiten con nada, sí se aplicaban: el síntoma más difícil de leer.
   */
  const source = readFileSync(new URL("../pages/theme.css.ts", import.meta.url), "utf8");

  it("envuelve la paleta en un selector más específico que [data-theme=x]", () => {
    expect(source).toContain(":root[data-theme] {");
  });

  it("no vuelve a un `:root` pelado", () => {
    expect(source).not.toMatch(/`:root \{/);
  });
});
