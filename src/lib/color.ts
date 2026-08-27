/**
 * Hex to the OKLCH components daisyUI expects.
 *
 * daisyUI 4 stores its palette as bare OKLCH numbers — `--p: 49.12% 0.3096 275.75` — and
 * composes them with alpha at use time. The settings screen offers an `<input
 * type="color">`, which can only produce hex, so writing that value straight into `--p`
 * produced an invalid colour and the theme pickers silently did nothing.
 *
 * Returns null for anything unparseable, so the caller can drop the variable instead of
 * emitting a broken one.
 */
export function hexToOklch(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const [r, g, b] = rgb.map(toLinear) as [number, number, number];

  // Linear sRGB → LMS
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  // LMS → OKLab
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const chroma = Math.hypot(A, B);
  // A neutral colour has no meaningful hue; report 0 rather than atan2's noise.
  const hue = chroma < 1e-6 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;

  return `${round(L * 100, 2)}% ${round(chroma, 4)} ${round(hue, 2)}`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * A theme value ready for a CSS custom property.
 *
 * Hex is converted; anything already in OKLCH component form is passed through, so a
 * value typed by hand into the text input beside the picker still works.
 */
export function themeColorValue(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("#")) return hexToOklch(value);
  // Already components, e.g. "49.12% 0.31 275.75"
  if (/^[\d.]+%?\s+[\d.]+\s+[\d.]+$/.test(value)) return value;
  return hexToOklch(value);
}
