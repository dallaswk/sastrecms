/**
 * The site's visual settings, declared once.
 *
 * Imported by three consumers that had drifted apart: `tailwind.config.ts`, which decides
 * which themes actually get compiled; the settings page, which offers them; and the layout,
 * which turns the stored values into CSS. Before this, the selector listed all 32 daisyUI
 * themes while the config generated two — so 30 of the 32 choices did nothing at all, and
 * nothing said so.
 *
 * Plain TypeScript with no imports on purpose: the Tailwind config is loaded by PostCSS in
 * a plain Node process, where the `@lib/*` alias does not exist and Astro is not available.
 */

/**
 * The themes that get compiled, and therefore the only ones worth offering.
 *
 * Curated rather than all 32. Every theme adds its full palette to the stylesheet of every
 * public page, so generating all of them charges every visitor for a choice the site owner
 * makes once. These eight cover what a client site actually asks for — two neutrals, two
 * corporate, two warm, two dark — and the fine-grained control is the colour pickers, which
 * override the palette on top of whichever theme is picked.
 */
export const SITE_THEMES = [
  "light",
  "dark",
  "corporate",
  "business",
  "emerald",
  "autumn",
  "winter",
  "luxury",
] as const;

export type SiteThemeName = (typeof SITE_THEMES)[number];

export const THEME_LABELS: Record<SiteThemeName, string> = {
  light: "Claro",
  dark: "Oscuro",
  corporate: "Corporativo",
  business: "Business (oscuro sobrio)",
  emerald: "Esmeralda",
  autumn: "Otoño (cálido)",
  winter: "Invierno (frío)",
  luxury: "Luxury (oscuro con dorado)",
};

export const DEFAULT_THEME: SiteThemeName = "light";

export function isSiteTheme(value: unknown): value is SiteThemeName {
  return typeof value === "string" && (SITE_THEMES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ fuentes */

/**
 * A font choice.
 *
 * `google` is the family spec for the Google Fonts stylesheet. It is opt-in per choice and
 * flagged in the UI: hotlinking Google Fonts sends every visitor's IP to Google, which is
 * exactly the kind of transfer the site's own cookie banner is there to control — so the
 * defaults are system stacks that cost no request and disclose nothing.
 */
export type FontChoice = {
  key: string;
  label: string;
  /** The CSS font-family value. */
  stack: string;
  /** Google Fonts family spec, e.g. `Inter:wght@400;600`. Absent for system stacks. */
  google?: string;
  /** Shown in the selector. */
  note?: string;
};

const SYSTEM_SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SYSTEM_SERIF = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
const SYSTEM_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

export const FONTS: FontChoice[] = [
  { key: "system", label: "Del sistema (sans)", stack: SYSTEM_SANS, note: "Sin peticiones externas" },
  { key: "system-serif", label: "Del sistema (serif)", stack: SYSTEM_SERIF, note: "Sin peticiones externas" },
  { key: "system-mono", label: "Del sistema (monoespaciada)", stack: SYSTEM_MONO, note: "Sin peticiones externas" },
  { key: "inter", label: "Inter", stack: `"Inter", ${SYSTEM_SANS}`, google: "Inter:wght@400;500;600;700" },
  { key: "figtree", label: "Figtree", stack: `"Figtree", ${SYSTEM_SANS}`, google: "Figtree:wght@400;500;600;700" },
  { key: "source-sans", label: "Source Sans 3", stack: `"Source Sans 3", ${SYSTEM_SANS}`, google: "Source+Sans+3:wght@400;600;700" },
  { key: "libre-franklin", label: "Libre Franklin", stack: `"Libre Franklin", ${SYSTEM_SANS}`, google: "Libre+Franklin:wght@400;600;700" },
  { key: "newsreader", label: "Newsreader (serif)", stack: `"Newsreader", ${SYSTEM_SERIF}`, google: "Newsreader:opsz,wght@6..72,400;6..72,600" },
  { key: "source-serif", label: "Source Serif 4 (serif)", stack: `"Source Serif 4", ${SYSTEM_SERIF}`, google: "Source+Serif+4:opsz,wght@8..60,400;8..60,600" },
  { key: "lora", label: "Lora (serif)", stack: `"Lora", ${SYSTEM_SERIF}`, google: "Lora:wght@400;600" },
  { key: "playfair", label: "Playfair Display (titulares)", stack: `"Playfair Display", ${SYSTEM_SERIF}`, google: "Playfair+Display:wght@500;700" },
];

export const DEFAULT_FONT = "system";

export function getFont(key: unknown): FontChoice {
  return FONTS.find((font) => font.key === key) ?? FONTS[0];
}

/**
 * The single Google Fonts URL for the chosen pair, or null when neither needs one.
 *
 * One request for both families rather than two: two `<link>` elements to the same host are
 * two round trips before the first paint.
 */
export function googleFontsHref(headingKey: unknown, bodyKey: unknown): string | null {
  const specs = [...new Set([getFont(headingKey).google, getFont(bodyKey).google].filter(Boolean))];
  if (!specs.length) return null;
  return `https://fonts.googleapis.com/css2?${specs.map((s) => `family=${s}`).join("&")}&display=swap`;
}

/* -------------------------------------------------------- ancho y escala */

export const CONTAINER_WIDTHS = [
  { key: "estrecho", label: "Estrecho (56rem)", value: "56rem" },
  { key: "normal", label: "Normal (64rem)", value: "64rem" },
  { key: "ancho", label: "Ancho (76rem)", value: "76rem" },
  { key: "completo", label: "Muy ancho (88rem)", value: "88rem" },
] as const;

export const DEFAULT_CONTAINER = "normal";

export const TYPE_SCALES = [
  { key: "compacta", label: "Compacta", value: "15px" },
  { key: "normal", label: "Normal", value: "16px" },
  { key: "amplia", label: "Amplia", value: "17px" },
  { key: "grande", label: "Grande (accesible)", value: "18px" },
] as const;

export const DEFAULT_TYPE_SCALE = "normal";

function lookup(list: readonly { key: string; value: string }[], key: unknown, fallback: string) {
  return list.find((item) => item.key === key)?.value ?? list.find((i) => i.key === fallback)!.value;
}

/* ------------------------------------------------------------ generación */

/** What settings stores under `theme`. Every field optional: an old row has none of them. */
export type SiteTheme = {
  daisyuiTheme?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  baseColor?: string;
  borderRadius?: string;
  fontHeading?: string;
  fontBody?: string;
  containerWidth?: string;
  typeScale?: string;
};

/** daisyUI's readable-foreground variable for each background it derives. */
const CONTRAST_FOR: Record<string, string> = { "--p": "--pc", "--s": "--sc", "--a": "--ac" };

const CSS_VAR_MAP: Record<string, string> = {
  primaryColor: "--p",
  secondaryColor: "--s",
  accentColor: "--a",
  baseColor: "--b1",
  borderRadius: "--rounded-box",
};

const COLOR_VARS = new Set(["--p", "--s", "--a", "--b1"]);

/**
 * The site's `:root` block.
 *
 * Returns the declarations only, so the caller decides whether they go in a `<style>` or in
 * a cacheable stylesheet. `toOklch` is injected rather than imported to keep this module
 * free of dependencies — the Tailwind config imports it too.
 */
export function buildThemeCss(
  raw: SiteTheme | null | undefined,
  toOklch: (value: string) => string | null
): string {
  const theme = raw ?? {};
  const parts: string[] = [];

  // daisyUI 4 keeps its palette as bare OKLCH components, but settings offers a colour
  // picker, which can only give hex. Writing the hex straight in produced an invalid value
  // and the theme pickers did nothing at all.
  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    const value = (theme as Record<string, string | undefined>)[key];
    if (!value) continue;

    if (!COLOR_VARS.has(cssVar)) {
      parts.push(`${cssVar}: ${value};`);
      continue;
    }

    const converted = toOklch(String(value));
    if (!converted) continue;
    parts.push(`${cssVar}: ${converted};`);

    // daisyUI derives the readable foreground from the background, but only for its own
    // themes; an overridden --p leaves --pc pointing at the old one. Pick black or white by
    // lightness so a custom primary never renders text on top of itself.
    const contrast = CONTRAST_FOR[cssVar];
    if (contrast) {
      const lightness = parseFloat(converted);
      parts.push(`${contrast}: ${lightness > 60 ? "0% 0 0" : "100% 0 0"};`);
    }
  }

  parts.push(`--font-heading: ${getFont(theme.fontHeading).stack};`);
  parts.push(`--font-body: ${getFont(theme.fontBody).stack};`);
  parts.push(`--site-width: ${lookup(CONTAINER_WIDTHS, theme.containerWidth, DEFAULT_CONTAINER)};`);
  parts.push(`--type-scale: ${lookup(TYPE_SCALES, theme.typeScale, DEFAULT_TYPE_SCALE)};`);

  return parts.join(" ");
}

/**
 * A short, stable fingerprint of the theme, for the stylesheet's URL.
 *
 * The theme lives in the database but is served as a file, so the URL has to change when the
 * theme does — otherwise the visitor keeps the old palette until their cache expires. Not a
 * hash for security: it only has to differ when the input differs.
 */
export function themeFingerprint(raw: SiteTheme | null | undefined): string {
  const source = JSON.stringify(raw ?? {});
  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
