import type { BillingStatus, TenantStatus } from "@db/control-schema";

/**
 * De lo que se debe a si el sitio sirve.
 *
 * Dos ejes distintos —`billingStatus` y `status`— y esta función es el único sitio donde el
 * primero decide sobre el segundo. Está separada de la base de datos y de la pasarela a
 * propósito: es una política de negocio, se discute con fechas concretas delante, y probarla no
 * puede depender de que hoy sea un día u otro.
 *
 * Lo que no hace, y es deliberado: no habla con ninguna pasarela. Quién actualiza
 * `billingStatus` —un webhook, una revisión a mano— es otro problema, y mantenerlo fuera es lo
 * que permite cambiar de proveedor sin tocar las reglas.
 */

export type BillingFacts = {
  status: TenantStatus;
  billingStatus: BillingStatus | null;
  trialEndsAt: Date | null;
  graceUntil: Date | null;
};

export type Decision = {
  /** El estado que debería tener. Igual al actual cuando no hay que hacer nada. */
  status: TenantStatus;
  /** Por qué. Se guarda en `suspendedReason` y se le enseña a quien administra. */
  reason: string | null;
  /** Si hace falta escribir. */
  changed: boolean;
};

function keep(facts: BillingFacts): Decision {
  return { status: facts.status, reason: null, changed: false };
}

function to(facts: BillingFacts, status: TenantStatus, reason: string | null): Decision {
  return { status, reason, changed: status !== facts.status };
}

/**
 * Qué debería pasarle a este inquilino hoy.
 *
 * El orden de las guardas importa y cada una está por algo:
 *
 *  1. **Sin facturación, no se toca.** Nulo es «este no se factura»: los que ya existían antes
 *     de que hubiera facturación, los internos, los regalados. Si esta guarda no fuera la
 *     primera, poner en marcha la facturación suspendería a todo el mundo.
 *  2. **`provisioning` tampoco.** No está sirviendo porque le falta la base, no porque deba
 *     dinero, y activarlo desde aquí lo pondría a servir una base a medio montar.
 */
export function decide(facts: BillingFacts, now: Date): Decision {
  if (!facts.billingStatus) return keep(facts);
  if (facts.status === "provisioning") return keep(facts);

  switch (facts.billingStatus) {
    case "paid":
      return to(facts, "active", null);

    case "trialing": {
      // Sin fecha de fin, la prueba no ha caducado. Una prueba sin fecha es un error de datos,
      // y el que se equivoque no puede costarle el sitio a un cliente.
      if (!facts.trialEndsAt || now <= facts.trialEndsAt) return to(facts, "active", null);
      return to(facts, "suspended", "La prueba ha terminado y no hay suscripción.");
    }

    case "past_due": {
      /*
       * El caso que justifica todo esto.
       *
       * Un cobro rechazado casi nunca es alguien que no quiere pagar: es una tarjeta caducada.
       * Apagar la web de un cliente el día que su banco dice que no le hace un daño
       * desproporcionado y no adelanta el cobro ni un día. Se sigue sirviendo hasta que se acaba
       * el margen.
       */
      if (facts.graceUntil && now <= facts.graceUntil) return to(facts, "active", null);
      return to(facts, "suspended", "Pago pendiente y el margen de cortesía ha terminado.");
    }

    case "cancelled":
      return to(facts, "suspended", "Suscripción cancelada.");
  }
}

/** Cuántos días de margen se dan por defecto al pasar a impago. */
export const GRACE_DAYS = 14;

/** Cuánto dura una prueba por defecto. */
export const TRIAL_DAYS = 14;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Cuánto le queda, para enseñarlo.
 *
 * Negativo significa que ya ha pasado. Devuelve nulo cuando no hay fecha que contar, que no es
 * lo mismo que cero.
 */
export function daysLeft(deadline: Date | null, now: Date): number | null {
  if (!deadline) return null;
  return Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Una línea sobre el estado de pago, para el panel.
 *
 * Dice lo que va a pasar y cuándo, no sólo dónde está: «pago pendiente» no le sirve a nadie
 * para decidir si llamar al cliente hoy o la semana que viene.
 */
export function billingSummary(facts: BillingFacts, now: Date): string {
  if (!facts.billingStatus) return "No se factura.";

  switch (facts.billingStatus) {
    case "paid":
      return "Al corriente.";
    case "trialing": {
      const left = daysLeft(facts.trialEndsAt, now);
      if (left === null) return "En prueba, sin fecha de fin.";
      return left >= 0
        ? `En prueba: ${left} día(s).`
        : `La prueba terminó hace ${Math.abs(left)} día(s).`;
    }
    case "past_due": {
      const left = daysLeft(facts.graceUntil, now);
      if (left === null) return "Pago pendiente, sin margen: se suspende al aplicar la política.";
      return left >= 0
        ? `Pago pendiente. Se suspende en ${left} día(s).`
        : `Pago pendiente. Debería estar suspendido desde hace ${Math.abs(left)} día(s).`;
    }
    case "cancelled":
      return "Cancelado.";
  }
}
