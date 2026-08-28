import { describe, it, expect } from "vitest";
import { decide, billingSummary, daysLeft, addDays, type BillingFacts } from "./billing";

/**
 * La política de cobro, con fechas concretas delante.
 *
 * Es la única parte del sistema que puede apagar el sitio de un cliente sola. Se prueba con
 * fechas fijas y no con `new Date()` por lo de siempre: una regla que sólo falla el día 31 es
 * una regla que se descubre el día 31.
 */

const NOW = new Date("2026-06-15T12:00:00Z");

function facts(overrides: Partial<BillingFacts> = {}): BillingFacts {
  return {
    status: "active",
    billingStatus: "paid",
    trialEndsAt: null,
    graceUntil: null,
    ...overrides,
  };
}

describe("a quién no se toca", () => {
  it("al que no se factura", () => {
    // Nulo es «este no entra en la facturación»: los que existían antes, los internos, los
    // regalados. Si esta guarda no fuera la primera, encender la facturación suspendería a
    // todo el mundo de golpe.
    const decision = decide(facts({ billingStatus: null, status: "active" }), NOW);
    expect(decision.changed).toBe(false);
    expect(decision.status).toBe("active");
  });

  it("al que todavía se está montando", () => {
    // No sirve porque le falta la base, no porque deba dinero. Activarlo desde aquí lo pondría
    // a servir una base a medio construir.
    const decision = decide(facts({ status: "provisioning", billingStatus: "paid" }), NOW);
    expect(decision.status).toBe("provisioning");
    expect(decision.changed).toBe(false);
  });
});

describe("prueba", () => {
  it("sirve mientras dura", () => {
    const decision = decide(
      facts({ billingStatus: "trialing", trialEndsAt: addDays(NOW, 3), status: "active" }),
      NOW
    );
    expect(decision.status).toBe("active");
  });

  it("se suspende al terminar", () => {
    const decision = decide(
      facts({ billingStatus: "trialing", trialEndsAt: addDays(NOW, -1), status: "active" }),
      NOW
    );
    expect(decision.status).toBe("suspended");
    expect(decision.changed).toBe(true);
    expect(decision.reason).toMatch(/prueba/i);
  });

  it("el último día todavía cuenta", () => {
    // Estrictamente mayor, no mayor o igual: quien tiene la prueba hasta el día 15 la tiene
    // el día 15 entero.
    const decision = decide(facts({ billingStatus: "trialing", trialEndsAt: NOW }), NOW);
    expect(decision.status).toBe("active");
  });

  it("sin fecha de fin no caduca", () => {
    // Una prueba sin fecha es un error de datos, y ese error no puede costarle el sitio a un
    // cliente.
    const decision = decide(facts({ billingStatus: "trialing", trialEndsAt: null }), NOW);
    expect(decision.status).toBe("active");
  });
});

describe("impago", () => {
  it("se sigue sirviendo durante el margen", () => {
    // El caso que justifica todo esto: un cobro rechazado casi siempre es una tarjeta caducada.
    const decision = decide(
      facts({ billingStatus: "past_due", graceUntil: addDays(NOW, 10) }),
      NOW
    );
    expect(decision.status).toBe("active");
  });

  it("se suspende cuando el margen se acaba", () => {
    const decision = decide(
      facts({ billingStatus: "past_due", graceUntil: addDays(NOW, -1) }),
      NOW
    );
    expect(decision.status).toBe("suspended");
    expect(decision.reason).toMatch(/margen/i);
  });

  it("sin margen fijado, se suspende", () => {
    // Al revés que la prueba, y a propósito: aquí el dato que falta es el que te protege a ti,
    // y allí el que protege al cliente.
    expect(decide(facts({ billingStatus: "past_due", graceUntil: null }), NOW).status).toBe(
      "suspended"
    );
  });
});

describe("cancelación", () => {
  it("suspende sin margen", () => {
    const decision = decide(facts({ billingStatus: "cancelled" }), NOW);
    expect(decision.status).toBe("suspended");
    expect(decision.reason).toMatch(/cancelad/i);
  });
});

describe("volver", () => {
  it("pagar reactiva a un suspendido", () => {
    // La suspensión no borra nada, así que pagar tiene que devolverlo entero.
    const decision = decide(facts({ status: "suspended", billingStatus: "paid" }), NOW);
    expect(decision.status).toBe("active");
    expect(decision.changed).toBe(true);
  });

  it("y no dice nada si ya estaba activo", () => {
    expect(decide(facts({ status: "active", billingStatus: "paid" }), NOW).changed).toBe(false);
  });
});

describe("lo que se le enseña a quien administra", () => {
  it("dice cuándo, no sólo qué", () => {
    // «Pago pendiente» a secas no sirve para decidir si llamar al cliente hoy o la semana que
    // viene.
    expect(billingSummary(facts({ billingStatus: "past_due", graceUntil: addDays(NOW, 5) }), NOW))
      .toBe("Pago pendiente. Se suspende en 5 día(s).");
    expect(billingSummary(facts({ billingStatus: "trialing", trialEndsAt: addDays(NOW, 7) }), NOW))
      .toBe("En prueba: 7 día(s).");
  });

  it("y avisa cuando ya se ha pasado", () => {
    expect(billingSummary(facts({ billingStatus: "past_due", graceUntil: addDays(NOW, -3) }), NOW))
      .toMatch(/desde hace 3 día/);
  });

  it("el que no se factura lo dice", () => {
    expect(billingSummary(facts({ billingStatus: null }), NOW)).toBe("No se factura.");
  });
});

describe("daysLeft", () => {
  it("sin fecha devuelve nulo, que no es cero", () => {
    expect(daysLeft(null, NOW)).toBeNull();
    expect(daysLeft(NOW, NOW)).toBe(0);
  });
});
