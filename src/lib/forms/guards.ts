import { HONEYPOT_FIELD, RATE_LIMIT } from "./types";

/**
 * The three defences against a spammed contact form, in the order they cost something.
 *
 * Notably absent: a signed "form rendered at" token to reject submissions that arrive
 * impossibly fast. It is effective and cheap, but it makes the HTML per-request, and public
 * HTML in this project has to stay cacheable — a cached page would hand every visitor the
 * same stale token. Turnstile is the defence that survives caching, because its token comes
 * from Cloudflare rather than from our own response.
 */

/** True when the honeypot was filled in, which no person does. */
export function honeypotTripped(input: unknown): boolean {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const value = raw[HONEYPOT_FIELD];
  return typeof value === "string" ? value.trim() !== "" : !!value;
}

/**
 * SHA-256 of the IP salted with the app secret.
 *
 * Salted so the table cannot be turned back into a list of addresses by hashing candidates,
 * and so hashes are useless if the database leaks. WebCrypto rather than node:crypto: this
 * runs on Workers.
 */
export async function hashIp(ip: string | null, secret: string): Promise<string | null> {
  if (!ip) return null;
  const data = new TextEncoder().encode(`${secret}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The client's address as Cloudflare reports it.
 *
 * `CF-Connecting-IP` is set by the edge and cannot be spoofed by the client; the
 * `X-Forwarded-For` fallback exists for local development only, where anything is
 * spoofable anyway and the rate limiter is not the thing being tested.
 */
export function clientIp(headers: Headers): string | null {
  const cf = headers.get("CF-Connecting-IP");
  if (cf) return cf;
  const forwarded = headers.get("X-Forwarded-For");
  return forwarded?.split(",")[0]?.trim() || null;
}

export type RateVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * Decides from two counts the caller has already taken.
 *
 * Split out from the queries so the thresholds are testable without a database — the part
 * that is easy to get wrong is the comparison, not the SELECT.
 */
export function rateVerdict(counts: { fromIp: number; fromSite: number }): RateVerdict {
  if (counts.fromIp >= RATE_LIMIT.perIp.max) {
    return {
      allowed: false,
      reason:
        `Has enviado varios mensajes en los últimos ${RATE_LIMIT.perIp.windowMinutes} minutos. ` +
        "Espera un momento antes de volver a intentarlo.",
    };
  }
  if (counts.fromSite >= RATE_LIMIT.perSite.max) {
    return {
      allowed: false,
      reason: "El formulario está recibiendo demasiados envíos ahora mismo. Inténtalo más tarde.",
    };
  }
  return { allowed: true };
}

/** Start of each rate limit window, from a caller-supplied now. */
export function rateWindows(now: Date): { ip: Date; site: Date } {
  return {
    ip: new Date(now.getTime() - RATE_LIMIT.perIp.windowMinutes * 60_000),
    site: new Date(now.getTime() - RATE_LIMIT.perSite.windowMinutes * 60_000),
  };
}

/**
 * Verifies a Turnstile token with Cloudflare.
 *
 * Returns `skipped` when no secret is configured rather than failing closed: a site whose
 * owner has not set up Turnstile yet must still be able to receive messages — the honeypot
 * and the rate limit are still in force. The backoffice says so out loud instead.
 */
export async function verifyTurnstile(
  secret: string | undefined,
  token: unknown,
  ip: string | null
): Promise<{ ok: true; skipped?: boolean } | { ok: false; reason: string }> {
  if (!secret) return { ok: true, skipped: true };

  if (typeof token !== "string" || !token) {
    return { ok: false, reason: "Falta la verificación anti-spam. Recarga la página." };
  }

  try {
    const body = new FormData();
    body.append("secret", secret);
    body.append("response", token);
    if (ip) body.append("remoteip", ip);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const result = (await response.json()) as { success?: boolean; "error-codes"?: string[] };

    if (result.success) return { ok: true };
    return {
      ok: false,
      reason: "La verificación anti-spam no ha pasado. Recarga la página e inténtalo de nuevo.",
    };
  } catch {
    // Cloudflare unreachable. Failing open loses the spam guard; failing closed loses the
    // client's lead. The lead is worth more, and the honeypot and rate limit still applied.
    return { ok: true, skipped: true };
  }
}
