/**
 * Verificar la firma de un webhook de Stripe.
 *
 * Escrito con Web Crypto en vez de con el SDK de Stripe por dónde corre esto: un Worker con
 * límite de tamaño. El SDK pesa cientos de kilobytes y de él sólo se usaría esta función —
 * recibir webhooks no necesita cliente de API, porque el evento trae dentro todo lo que hace
 * falta.
 *
 * Escribir verificación de firmas a mano es normalmente mala idea, así que conviene decir por
 * qué aquí no lo es: el esquema de Stripe es HMAC-SHA256 sobre `timestamp.cuerpo`, está
 * documentado, y no hay nada que inventar. Lo que sí hay que hacer bien está aquí y tiene test:
 * comparar en tiempo constante, rechazar por antigüedad, y aceptar varias firmas en la misma
 * cabecera. Los tests generan la firma con `node:crypto`, que es otra implementación distinta:
 * si las dos coinciden, no es que el código se esté dando la razón a sí mismo.
 *
 * https://docs.stripe.com/webhooks/signature
 */

export type VerifyResult =
  | { ok: true; event: Record<string, unknown> }
  | { ok: false; reason: string };

/** Cuánto se acepta de desfase. Stripe recomienda cinco minutos. */
export const TOLERANCE_SECONDS = 300;

/** `t=1720000000,v1=abc...,v1=def...` → sus partes. */
function parseHeader(header: string): { timestamp: number | null; signatures: string[] } {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (!key || !value) continue;
    if (key.trim() === "t") {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) timestamp = parsed;
    }
    // Puede venir más de una: Stripe firma con todos los secretos activos mientras se rotan,
    // y quedarse con la primera haría fallar la rotación.
    if (key.trim() === "v1") signatures.push(value.trim());
  }

  return { timestamp, signatures };
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Comparación en tiempo constante.
 *
 * Con `===` el tiempo de respuesta depende de cuántos caracteres coinciden, y eso deja adivinar
 * una firma byte a byte. Es una cantidad de peticiones enorme y por HTTP el ruido lo tapa casi
 * todo — pero cuesta cuatro líneas hacerlo bien y la alternativa es confiar en el ruido.
 */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyStripeSignature(
  /** El cuerpo **crudo**. Volver a serializar el JSON cambia la firma. */
  payload: string,
  header: string | null,
  secret: string,
  now: Date = new Date(),
  tolerance = TOLERANCE_SECONDS
): Promise<VerifyResult> {
  if (!header) return { ok: false, reason: "Sin cabecera Stripe-Signature." };
  if (!secret) return { ok: false, reason: "STRIPE_WEBHOOK_SECRET no está configurado." };

  const { timestamp, signatures } = parseHeader(header);
  if (timestamp === null) return { ok: false, reason: "La cabecera no trae marca de tiempo." };
  if (!signatures.length) return { ok: false, reason: "La cabecera no trae ninguna firma v1." };

  /*
   * La ventana temporal es lo que impide reproducir la petición.
   *
   * Sin esto, cualquiera que capture un webhook válido puede reenviarlo mañana y la firma
   * seguirá siendo correcta para siempre. Se comprueba antes de calcular el HMAC porque es
   * más barato y porque un evento viejo no merece el cálculo.
   */
  const age = Math.abs(Math.floor(now.getTime() / 1000) - timestamp);
  if (age > tolerance) {
    return { ok: false, reason: `El evento tiene ${age}s: fuera de la ventana de ${tolerance}s.` };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`)
  );
  const expected = toHex(mac);

  if (!signatures.some((signature) => equals(signature, expected))) {
    return { ok: false, reason: "La firma no coincide." };
  }

  try {
    const event = JSON.parse(payload) as Record<string, unknown>;
    return { ok: true, event };
  } catch {
    // Firma válida y JSON ilegible no debería pasar nunca; si pasa, es más interesante saberlo
    // que tratarlo como un fallo de firma.
    return { ok: false, reason: "Firma válida pero el cuerpo no es JSON." };
  }
}
