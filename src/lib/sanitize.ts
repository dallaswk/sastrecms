import { parse, ELEMENT_NODE, TEXT_NODE, DOCUMENT_NODE } from "ultrahtml";

/**
 * Sanitising the rich text a person or an agent writes.
 *
 * ultrahtml's own sanitize transformer is not enough, and this was verified by running it
 * rather than reading its docs: it keeps `onclick`, it keeps `href="javascript:…"`, and on a
 * `data:` URI containing markup it breaks out of the attribute and emits the payload as
 * text. So this walks the tree and serialises it itself — an allowlist of elements, an
 * allowlist of attributes, and a scheme check on every URL.
 *
 * Applied in two places on purpose: when the value is written, so the database does not hold
 * a payload, and when it is rendered, so content written before this existed is still safe.
 * The MCP endpoint writes `fields` without going through the actions, which is exactly why
 * the render-time pass is not redundant.
 */

/** Elements a rich-text field may contain. */
const ALLOWED_ELEMENTS = new Set([
  "p", "br", "hr",
  "strong", "b", "em", "i", "u", "s", "del", "ins", "mark", "small", "sub", "sup",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "img", "figure", "figcaption",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "span", "div",
]);

/**
 * Elements dropped along with their contents.
 *
 * The distinction matters: an unknown wrapper should lose the tag and keep the text, but the
 * contents of a `<script>` or a `<style>` *are* the payload, so unwrapping them would paste
 * the code into the page as text.
 */
const DROP_WITH_CONTENTS = new Set([
  "script", "style", "iframe", "object", "embed", "noscript", "template",
  "form", "input", "button", "select", "textarea", "option", "svg", "math",
  "link", "meta", "base", "title", "head", "audio", "video", "source", "track",
]);

/** Attributes allowed, per element. `*` applies to every allowed element. */
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  "*": new Set(["class", "id", "title", "dir", "lang"]),
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "loading", "decoding", "sizes", "srcset"]),
  th: new Set(["colspan", "rowspan", "scope", "headers"]),
  td: new Set(["colspan", "rowspan", "headers"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  ol: new Set(["start", "type", "reversed"]),
  blockquote: new Set(["cite"]),
};

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);

/** Attributes that carry a URL and therefore need a scheme check. */
const URL_ATTRIBUTES = new Set(["href", "src", "srcset", "cite"]);

/**
 * Schemes a URL may use.
 *
 * `data:` is refused outright, including `data:image/svg+xml`: an SVG is a document and can
 * carry scripts, so allowing image data URIs would let scripts through the one attribute
 * everybody assumes is safe.
 */
const SAFE_SCHEME = /^(https?:|mailto:|tel:)/i;

/** A scheme-looking prefix. Anything matching this and not SAFE_SCHEME is rejected. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function safeUrl(raw: string): string | null {
  // Control characters and whitespace inside a scheme are how `java\nscript:` gets past a
  // naive check, so they come out before anything else is decided.
  const value = raw.replace(/[\u0000-\u0020\u007f-\u009f]/g, "").trim();
  if (!value) return null;

  // Relative, root-relative and anchors are all fine and carry no scheme.
  if (value.startsWith("#") || value.startsWith("/") || value.startsWith("?")) return value;
  if (!HAS_SCHEME.test(value)) return value;

  return SAFE_SCHEME.test(value) ? value : null;
}

/** `srcset` is a comma-separated list, and one bad entry poisons the attribute. */
function safeSrcset(raw: string): string | null {
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  const safe: string[] = [];
  for (const part of parts) {
    const [url, ...descriptors] = part.split(/\s+/);
    const checked = safeUrl(url);
    if (!checked) return null;
    safe.push([checked, ...descriptors].join(" "));
  }
  return safe.length ? safe.join(", ") : null;
}

/**
 * An `&` that is not already the start of an entity.
 *
 * ultrahtml keeps entities in their raw form, so escaping every `&` double-escapes text that
 * was already correct: `&amp;` became `&amp;amp;` and the reader saw `&amp;` on the page.
 * Every accented character written as an entity, and every ampersand in a title, was affected —
 * and the sanitiser was not idempotent, so each save made it worse.
 */
const BARE_AMPERSAND = /&(?!#[0-9]{1,7};|#x[0-9a-f]{1,6};|[a-z][a-z0-9]{1,31};)/gi;

function escapeText(value: string): string {
  return value.replace(BARE_AMPERSAND, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value
    .replace(BARE_AMPERSAND, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attributeAllowed(element: string, name: string): boolean {
  const lower = name.toLowerCase();
  // Every event handler, in one rule, rather than a list a new one is missing from.
  if (lower.startsWith("on")) return false;
  // `style` is refused: it can position an element over the rest of the page, and it is the
  // attribute a CSP with no `unsafe-inline` blocks anyway.
  if (lower === "style") return false;
  if (lower.startsWith("data-")) return false;
  if (ALLOWED_ATTRIBUTES["*"].has(lower)) return true;
  return ALLOWED_ATTRIBUTES[element]?.has(lower) ?? false;
}

type Node = {
  type: number;
  name?: string;
  value?: string;
  attributes?: Record<string, string>;
  children?: Node[];
};

function serialise(node: Node, depth: number): string {
  // Depth bound: the input is untrusted, and a few thousand nested tags is a stack overflow
  // on a public page rather than a rendering problem.
  if (depth > 60) return "";

  if (node.type === TEXT_NODE) return escapeText(node.value ?? "");
  if (node.type === DOCUMENT_NODE) {
    return (node.children ?? []).map((child) => serialise(child, depth)).join("");
  }
  if (node.type !== ELEMENT_NODE) return ""; // comments and doctypes go

  const name = (node.name ?? "").toLowerCase();

  if (DROP_WITH_CONTENTS.has(name)) return "";

  const children = (node.children ?? []).map((child) => serialise(child, depth + 1)).join("");

  // An unknown wrapper loses the tag and keeps the text: dropping the contents of a
  // `<section>` pasted from a Word document would silently delete the paragraph the editor
  // cared about.
  if (!ALLOWED_ELEMENTS.has(name)) return children;

  const attrs: string[] = [];
  let isBlankTarget = false;

  for (const [rawName, rawValue] of Object.entries(node.attributes ?? {})) {
    if (!attributeAllowed(name, rawName)) continue;
    const attr = rawName.toLowerCase();
    let value = String(rawValue ?? "");

    if (URL_ATTRIBUTES.has(attr)) {
      const checked = attr === "srcset" ? safeSrcset(value) : safeUrl(value);
      if (checked === null) continue;
      value = checked;
    }

    if (attr === "target") {
      if (value !== "_blank") continue;
      isBlankTarget = true;
    }

    attrs.push(`${attr}="${escapeAttr(value)}"`);
  }

  // target="_blank" without this gives the opened page a handle on this one.
  if (isBlankTarget && !attrs.some((a) => a.startsWith("rel="))) {
    attrs.push('rel="noopener noreferrer"');
  }

  const open = attrs.length ? `<${name} ${attrs.join(" ")}>` : `<${name}>`;
  if (VOID_ELEMENTS.has(name)) return open;
  return `${open}${children}</${name}>`;
}

/**
 * Never throws: a rich-text field that cannot be parsed renders as nothing rather than taking
 * a public page down.
 */
export function sanitizeHtml(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) return "";
  try {
    return serialise(parse(input) as Node, 0);
  } catch {
    return "";
  }
}

/**
 * Walks a stored `fields` object and sanitises every string that looks like markup.
 *
 * Applied on write from the actions and from the MCP surface. Which keys hold HTML is not
 * knowable here — a section's `body`, a repeater item's `text` — so it sanitises every string
 * that contains a tag and leaves plain text untouched, so a title with a `<` in it is not
 * mangled into an entity.
 */
export function sanitizeFields<T>(value: T, depth = 0): T {
  if (depth > 20) return value;

  if (typeof value === "string") {
    return (/<[a-z!/]/i.test(value) ? sanitizeHtml(value) : value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeFields(item, depth + 1)) as unknown as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeFields(item, depth + 1),
      ])
    ) as unknown as T;
  }
  return value;
}
