/**
 * Sharing a draft with a client, by link.
 *
 * Stateless and signed rather than a table of tokens. Three reasons: nothing to clean up when a
 * link expires, no row to leak, and no write on the public path — a preview link that inserted a
 * row would be a way for anybody to grow the database by loading a URL.
 *
 * HMAC-SHA256 over `nodeId:expiry` with the app secret. WebCrypto, because this runs on Workers.
 */

const SEPARATOR = ".";

/** Two days: long enough to send it and get an answer, short enough to expire on its own. */
export const DEFAULT_PREVIEW_TTL_SECONDS = 60 * 60 * 48;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

/**
 * A token for one node, valid until an instant.
 *
 * The node id is inside the signature, so a token for one page cannot be moved to another — and
 * the expiry is inside it too, so it cannot be extended by editing the URL.
 */
export async function createPreviewToken(
  nodeId: string,
  secret: string,
  now: Date,
  ttlSeconds = DEFAULT_PREVIEW_TTL_SECONDS
): Promise<string> {
  const expiry = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const payload = `${nodeId}${SEPARATOR}${expiry}`;
  return `${payload}${SEPARATOR}${await sign(payload, secret)}`;
}

export type PreviewCheck =
  | { valid: true; nodeId: string; expiresAt: Date }
  | { valid: false; reason: "malformed" | "expired" | "bad-signature" };

/**
 * Verifies a token.
 *
 * The signature is checked *before* the expiry on purpose: reporting «expired» for a forged
 * token tells whoever forged it that their payload format is right, which is one bit more than
 * they should get.
 */
export async function verifyPreviewToken(
  token: unknown,
  secret: string,
  now: Date
): Promise<PreviewCheck> {
  if (typeof token !== "string" || !token) return { valid: false, reason: "malformed" };

  const parts = token.split(SEPARATOR);
  if (parts.length !== 3) return { valid: false, reason: "malformed" };

  const [nodeId, expiryRaw, signature] = parts as [string, string, string];
  const expiry = Number(expiryRaw);
  if (!nodeId || !Number.isInteger(expiry)) return { valid: false, reason: "malformed" };

  const expected = await sign(`${nodeId}${SEPARATOR}${expiry}`, secret);
  // Length-independent comparison. These are fixed-length base64url of a SHA-256, so a plain
  // === leaks little, but a constant-time compare costs nothing and removes the question.
  if (!timingSafeEqual(signature, expected)) return { valid: false, reason: "bad-signature" };

  if (expiry * 1000 <= now.getTime()) return { valid: false, reason: "expired" };

  return { valid: true, nodeId, expiresAt: new Date(expiry * 1000) };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The query parameter the public route looks for. */
export const PREVIEW_PARAM = "vista-previa";

export function previewUrl(origin: string, path: string, token: string): string {
  const url = new URL(path, origin);
  url.searchParams.set(PREVIEW_PARAM, token);
  return url.toString();
}
