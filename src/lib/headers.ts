/**
 * Security headers, and the CSP.
 *
 * Kept out of the middleware so the policy is one testable value rather than a string built
 * inline in a request handler.
 */

/** Headers every response gets, public or not. */
export const SECURITY_HEADERS: Record<string, string> = {
  // The site is never meant to be framed. DENY rather than SAMEORIGIN: nothing here embeds
  // itself, and SAMEORIGIN still allows a stored-XSS page to frame the backoffice.
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  // Strict-origin-when-cross-origin is the modern default, but stating it means a browser
  // with an older default does not leak the full URL of an admin page to a third party.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Nothing in this project uses any of these, so denying them removes the prompt entirely.
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=(), magnetometer=(), gyroscope=()",
  "X-DNS-Prefetch-Control": "off",
  "Cross-Origin-Opener-Policy": "same-origin",
};

/** HSTS is separate: sending it over plain HTTP is meaningless and in dev it is harmful. */
export const HSTS_HEADER = "max-age=63072000; includeSubDomains; preload";

export type CspOptions = {
  /** Which analytics hosts the visitor may have consented to. */
  allowAnalytics?: boolean;
  /** The R2 host images come from. */
  mediaHost?: string;
  /** Report-only while the policy is being proven; enforcing comes after. */
  reportOnly?: boolean;
};

const GOOGLE_TAG_HOSTS = ["https://www.googletagmanager.com", "https://www.google-analytics.com"];
const PIXEL_HOSTS = [
  "https://connect.facebook.net",
  "https://www.facebook.com",
  "https://analytics.tiktok.com",
  "https://static.hotjar.com",
  "https://*.hotjar.com",
  "https://*.hotjar.io",
];

/**
 * The policy.
 *
 * `strict-dynamic` is what makes this workable at all: the consent script injects the tracker
 * tags at runtime, and without it every one of those hosts would have to be enumerated in
 * `script-src` — a list that goes stale the moment a provider changes CDN. With it, a script
 * the browser already trusts may load more, and the host list becomes a fallback for older
 * browsers rather than the mechanism.
 *
 * `'unsafe-inline'` is present *after* `strict-dynamic` on purpose: a browser that supports
 * `strict-dynamic` ignores it, and one that does not needs it, because Astro emits inline
 * module preloads. This is the documented pattern, not an escape hatch.
 */
export function buildCsp(options: CspOptions = {}): string {
  const scriptHosts = [
    "'self'",
    "'strict-dynamic'",
    "'unsafe-inline'",
    "https:",
    ...(options.allowAnalytics ? [...GOOGLE_TAG_HOSTS, ...PIXEL_HOSTS] : []),
    "https://challenges.cloudflare.com",
  ];

  const imgHosts = ["'self'", "data:", "blob:", ...(options.mediaHost ? [options.mediaHost] : [])];
  if (options.allowAnalytics) {
    imgHosts.push("https://www.google-analytics.com", "https://www.facebook.com");
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptHosts,
    // Inline styles remain allowed: Tailwind is a stylesheet, but the section components use
    // `style` for aspect-ratio, and the alternative is a per-request hash — which is exactly
    // what moving the theme out to /theme.css was meant to avoid.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
    "img-src": imgHosts,
    "connect-src": [
      "'self'",
      ...(options.allowAnalytics ? [...GOOGLE_TAG_HOSTS, "https://*.hotjar.com", "https://*.hotjar.io"] : []),
    ],
    "frame-src": ["https://challenges.cloudflare.com", ...(options.allowAnalytics ? ["https://www.googletagmanager.com"] : [])],
    // Nothing is ever framed, and this is the header-independent form of X-Frame-Options.
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    // A stored-XSS payload that injects a <form> cannot post the visitor's input elsewhere.
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };

  const parts = Object.entries(directives)
    .filter(([, values]) => values.length > 0)
    .map(([name, values]) => `${name} ${values.join(" ")}`);

  parts.push("upgrade-insecure-requests");

  return parts.join("; ");
}

export const CSP_HEADER_ENFORCE = "Content-Security-Policy";
export const CSP_HEADER_REPORT = "Content-Security-Policy-Report-Only";
