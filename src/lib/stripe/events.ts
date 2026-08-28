import type { BillingStatus } from "@db/control-schema";
import { addDays, GRACE_DAYS } from "@lib/billing";

/**
 * De un evento de Stripe a un cambio en el plano de control.
 *
 * Pura: recibe el objeto del evento y devuelve qué habría que escribir. Todo lo que decide algo
 * está aquí y no en el endpoint, porque las decisiones se prueban y los endpoints se despliegan.
 */

export type BillingUpdate = {
  /** El cliente en Stripe. Es por donde se encuentra al inquilino: `tenants.billingRef`. */
  customerId: string;
  billingStatus: BillingStatus;
  /** `undefined` = no tocar. `null` = borrar. */
  trialEndsAt?: Date | null;
  graceUntil?: Date | null;
  /** Cuándo ocurrió, según Stripe. Lo que permite descartar eventos que llegan tarde. */
  eventAt: Date;
};

export type Interpretation =
  | { handled: true; update: BillingUpdate }
  | { handled: false; reason: string };

/** Los que dicen algo sobre si se cobra. El resto se acepta y se ignora. */
export const HANDLED_EVENTS = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
] as const;

function seconds(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null;
}

function customerOf(object: Record<string, unknown>): string | null {
  const customer = object.customer;
  if (typeof customer === "string") return customer;
  // Con `expand` viene el objeto entero en vez del id.
  if (customer && typeof customer === "object" && typeof (customer as { id?: unknown }).id === "string") {
    return (customer as { id: string }).id;
  }
  return null;
}

/**
 * El estado de una suscripción de Stripe, traducido.
 *
 * `unpaid` y `past_due` acaban los dos en impago pero con margen distinto: `past_due` es «el
 * cobro ha fallado, se sigue reintentando» y merece los días de cortesía; `unpaid` es «Stripe ya
 * ha agotado los reintentos», que es precisamente el final del margen. Devolver el mismo margen
 * para los dos regalaría dos semanas extra a quien ya lleva un mes sin pagar.
 *
 * `incomplete` no se traduce: es una suscripción cuyo primer pago nunca se completó, y tocar el
 * estado por ella pisaría la prueba en curso del inquilino.
 */
function fromSubscription(
  status: string,
  object: Record<string, unknown>,
  now: Date
): Omit<BillingUpdate, "customerId" | "eventAt"> | null {
  switch (status) {
    case "trialing":
      return { billingStatus: "trialing", trialEndsAt: seconds(object.trial_end), graceUntil: null };
    case "active":
      return { billingStatus: "paid", graceUntil: null };
    case "past_due":
      return { billingStatus: "past_due", graceUntil: addDays(now, GRACE_DAYS) };
    case "unpaid":
      // Sin margen, no «margen que acaba ahora»: la política compara con `<=`, así que una
      // fecha igual a este instante seguiría contando como dentro. `null` es lo que significa
      // «se acabó», y es el caso que `billing.ts` ya trata como suspender.
      return { billingStatus: "past_due", graceUntil: null };
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return { billingStatus: "cancelled", graceUntil: null };
    default:
      return null;
  }
}

export function interpret(event: Record<string, unknown>, now: Date): Interpretation {
  const type = typeof event.type === "string" ? event.type : "";
  if (!(HANDLED_EVENTS as readonly string[]).includes(type)) {
    return { handled: false, reason: `«${type}» no dice nada sobre el cobro.` };
  }

  const data = event.data as { object?: Record<string, unknown> } | undefined;
  const object = data?.object;
  if (!object) return { handled: false, reason: "El evento no trae objeto." };

  const customerId = customerOf(object);
  if (!customerId) return { handled: false, reason: "El evento no dice de qué cliente es." };

  const eventAt = seconds(event.created) ?? now;
  const base = { customerId, eventAt };

  if (type.startsWith("customer.subscription.")) {
    if (type.endsWith(".deleted")) {
      return { handled: true, update: { ...base, billingStatus: "cancelled", graceUntil: null } };
    }
    const status = typeof object.status === "string" ? object.status : "";
    const mapped = fromSubscription(status, object, now);
    if (!mapped) return { handled: false, reason: `Estado de suscripción «${status}» sin traducir.` };
    return { handled: true, update: { ...base, ...mapped } };
  }

  if (type === "invoice.payment_failed") {
    return {
      handled: true,
      update: { ...base, billingStatus: "past_due", graceUntil: addDays(now, GRACE_DAYS) },
    };
  }

  // invoice.paid / invoice.payment_succeeded
  return { handled: true, update: { ...base, billingStatus: "paid", graceUntil: null } };
}
