import { describe, it, expect } from "vitest";
import { interpret } from "./events";
import { decide } from "@lib/billing";

/**
 * Traducir Stripe.
 *
 * Los objetos son recortes de los de verdad: sólo los campos que se leen. Lo que se comprueba
 * no es que Stripe mande lo que se cree, sino que cada estado suyo acabe donde debe — y sobre
 * todo que ninguno acabe apagando un sitio que debería seguir en pie.
 */

const NOW = new Date("2026-06-15T12:00:00Z");
const CREATED = Math.floor(NOW.getTime() / 1000);

function event(type: string, object: Record<string, unknown>, created = CREATED) {
  return { id: "evt_x", type, created, data: { object } };
}

function subscription(status: string, extra: Record<string, unknown> = {}) {
  return { id: "sub_1", customer: "cus_1", status, ...extra };
}

describe("suscripciones", () => {
  it("activa = al corriente", () => {
    const reading = interpret(event("customer.subscription.updated", subscription("active")), NOW);
    expect(reading.handled && reading.update.billingStatus).toBe("paid");
  });

  it("en prueba trae la fecha de fin de Stripe", () => {
    const trialEnd = Math.floor(new Date("2026-07-01T00:00:00Z").getTime() / 1000);
    const reading = interpret(
      event("customer.subscription.updated", subscription("trialing", { trial_end: trialEnd })),
      NOW
    );
    expect(reading.handled && reading.update.billingStatus).toBe("trialing");
    expect(reading.handled && reading.update.trialEndsAt?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("past_due abre el margen; unpaid no", () => {
    /*
     * La distinción que importa: `past_due` es «el cobro ha fallado y se sigue reintentando» y
     * merece los días de cortesía. `unpaid` es «Stripe ya ha agotado los reintentos», que es
     * justo el final del margen. Darles el mismo trato regalaría dos semanas a quien lleva un
     * mes sin pagar.
     */
    const late = interpret(event("customer.subscription.updated", subscription("past_due")), NOW);
    const done = interpret(event("customer.subscription.updated", subscription("unpaid")), NOW);
    expect(late.handled && late.update.graceUntil! > NOW).toBe(true);
    // Nulo y no «un margen que acaba ahora»: la política compara con `<=`, así que una fecha
    // igual a este instante todavía contaría como dentro del margen.
    expect(done.handled && done.update.graceUntil).toBeNull();

    // Y comprobado a través de la política, que es donde se nota:
    const facts = { status: "active" as const, trialEndsAt: null };
    expect(decide({ ...facts, ...late.handled ? late.update : {} } as never, NOW).status).toBe("active");
    expect(decide({ ...facts, ...done.handled ? done.update : {} } as never, NOW).status).toBe("suspended");
  });

  it("cancelada, caducada y pausada acaban en cancelado", () => {
    for (const status of ["canceled", "incomplete_expired", "paused"]) {
      const reading = interpret(event("customer.subscription.updated", subscription(status)), NOW);
      expect(reading.handled && reading.update.billingStatus, status).toBe("cancelled");
    }
  });

  it("`deleted` cancela sin mirar el estado", () => {
    const reading = interpret(event("customer.subscription.deleted", subscription("active")), NOW);
    expect(reading.handled && reading.update.billingStatus).toBe("cancelled");
  });

  it("`incomplete` no se traduce", () => {
    // Una suscripción cuyo primer pago nunca se completó. Tocar el estado por ella pisaría la
    // prueba en curso del inquilino.
    const reading = interpret(event("customer.subscription.updated", subscription("incomplete")), NOW);
    expect(reading.handled).toBe(false);
  });
});

describe("facturas", () => {
  it("pagada = al corriente y sin margen abierto", () => {
    const reading = interpret(event("invoice.paid", { customer: "cus_1" }), NOW);
    expect(reading.handled && reading.update.billingStatus).toBe("paid");
    expect(reading.handled && reading.update.graceUntil).toBeNull();
  });

  it("fallida abre el margen, no suspende", () => {
    const reading = interpret(event("invoice.payment_failed", { customer: "cus_1" }), NOW);
    expect(reading.handled && reading.update.billingStatus).toBe("past_due");
    expect(reading.handled && reading.update.graceUntil! > NOW).toBe(true);
    // Lo que de verdad se quiere saber: el sitio sigue en pie.
    expect(
      decide(
        { status: "active", trialEndsAt: null, ...(reading.handled ? reading.update : {}) } as never,
        NOW
      ).status
    ).toBe("active");
  });
});

describe("lo que se ignora", () => {
  it("los tipos que no dicen nada del cobro", () => {
    const reading = interpret(event("charge.refunded", { customer: "cus_1" }), NOW);
    expect(reading.handled).toBe(false);
  });

  it("un evento sin cliente", () => {
    const reading = interpret(event("invoice.paid", { id: "in_1" }), NOW);
    expect(reading.handled).toBe(false);
  });

  it("pero sí lee el cliente cuando viene expandido", () => {
    const reading = interpret(event("invoice.paid", { customer: { id: "cus_9" } }), NOW);
    expect(reading.handled && reading.update.customerId).toBe("cus_9");
  });
});

describe("el orden", () => {
  it("cada actualización lleva cuándo ocurrió, según Stripe", () => {
    // Es lo que permite descartar un `payment_failed` que llegue después del `paid` que lo
    // resolvió: sin esta fecha, el que llega último gana y el cliente acaba suspendido
    // habiendo pagado.
    const before = CREATED - 600;
    const reading = interpret(event("invoice.payment_failed", { customer: "cus_1" }, before), NOW);
    expect(reading.handled && reading.update.eventAt.getTime()).toBe(before * 1000);
  });
});
