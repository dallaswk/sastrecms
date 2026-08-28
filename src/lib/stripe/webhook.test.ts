import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyStripeSignature, TOLERANCE_SECONDS } from "./webhook";

/**
 * La firma, comprobada contra otra implementación.
 *
 * Las firmas de estos tests las genera `node:crypto`, no el código que se está probando. Es la
 * diferencia entre comprobar que la verificación funciona y comprobar que es consistente
 * consigo misma — que es lo que pasa cuando el test firma con la misma función que verifica.
 */

const SECRET = "whsec_pruebaquenoesreal";
const NOW = new Date("2026-06-15T12:00:00Z");
const TS = Math.floor(NOW.getTime() / 1000);

/** Como firma Stripe, con la implementación de Node. */
function sign(payload: string, timestamp = TS, secret = SECRET): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

const BODY = JSON.stringify({ id: "evt_1", type: "invoice.paid", created: TS });

describe("firma válida", () => {
  it("acepta lo que firma Stripe y devuelve el evento", async () => {
    const result = await verifyStripeSignature(BODY, sign(BODY), SECRET, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.event.id).toBe("evt_1");
  });

  it("acepta cuando la cabecera trae varias firmas", async () => {
    // Stripe firma con todos los secretos activos mientras se rotan; quedarse con la primera
    // haría que la rotación fallase.
    const good = sign(BODY).split("v1=")[1]!;
    const header = `t=${TS},v1=${"0".repeat(64)},v1=${good}`;
    expect((await verifyStripeSignature(BODY, header, SECRET, NOW)).ok).toBe(true);
  });

  it("acepta dentro de la ventana", async () => {
    const header = sign(BODY, TS - (TOLERANCE_SECONDS - 10));
    expect((await verifyStripeSignature(BODY, header, SECRET, NOW)).ok).toBe(true);
  });
});

describe("firma inválida", () => {
  it("rechaza un cuerpo alterado", async () => {
    // El caso que importa: firma buena, contenido cambiado.
    const header = sign(BODY);
    const tampered = BODY.replace("invoice.paid", "invoice.payment_failed");
    const result = await verifyStripeSignature(tampered, header, SECRET, NOW);
    expect(result).toEqual({ ok: false, reason: "La firma no coincide." });
  });

  it("rechaza con otro secreto", async () => {
    const header = sign(BODY, TS, "whsec_otro");
    expect((await verifyStripeSignature(BODY, header, SECRET, NOW)).ok).toBe(false);
  });

  it("rechaza un evento viejo, aunque la firma sea buena", async () => {
    // Sin ventana temporal, quien capture un webhook válido puede reenviarlo mañana y la firma
    // seguirá siendo correcta para siempre.
    const header = sign(BODY, TS - TOLERANCE_SECONDS - 1);
    const result = await verifyStripeSignature(BODY, header, SECRET, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ventana/);
  });

  it("rechaza uno del futuro por el mismo margen", async () => {
    // Un reloj adelantado en el atacante no debería darle una firma eterna.
    const header = sign(BODY, TS + TOLERANCE_SECONDS + 1);
    expect((await verifyStripeSignature(BODY, header, SECRET, NOW)).ok).toBe(false);
  });

  it("rechaza reutilizar una firma con otro cuerpo del mismo tamaño", async () => {
    // La comparación es en tiempo constante y sale por longitud primero; esto comprueba que no
    // se está colando nada por ahí.
    const other = JSON.stringify({ id: "evt_2", type: "invoice.paid", created: TS });
    expect(other.length).toBe(BODY.length);
    expect((await verifyStripeSignature(other, sign(BODY), SECRET, NOW)).ok).toBe(false);
  });
});

describe("cabeceras rotas", () => {
  it("sin cabecera", async () => {
    expect(await verifyStripeSignature(BODY, null, SECRET, NOW)).toEqual({
      ok: false,
      reason: "Sin cabecera Stripe-Signature.",
    });
  });

  it("sin marca de tiempo", async () => {
    const result = await verifyStripeSignature(BODY, `v1=${"a".repeat(64)}`, SECRET, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/marca de tiempo/);
  });

  it("sin ninguna firma v1", async () => {
    const result = await verifyStripeSignature(BODY, `t=${TS},v0=abc`, SECRET, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/firma v1/);
  });

  it("sin secreto configurado no se acepta nada", async () => {
    // Fallar cerrado: un despliegue sin el secreto puesto no puede aceptar webhooks, porque
    // entonces los aceptaría todos.
    expect((await verifyStripeSignature(BODY, sign(BODY), "", NOW)).ok).toBe(false);
  });

  it("cuerpo no-JSON con firma válida se distingue de una firma mala", async () => {
    const raw = "esto no es json";
    const result = await verifyStripeSignature(raw, sign(raw), SECRET, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no es JSON/);
  });
});
