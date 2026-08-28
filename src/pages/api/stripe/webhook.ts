import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { createControlDb } from "@db/control-client";
import { tenants } from "@db/control-schema";
import { verifyStripeSignature } from "@lib/stripe/webhook";
import { interpret } from "@lib/stripe/events";
import { decide } from "@lib/billing";
import { forgetTenant } from "@lib/tenant";
import { domains } from "@db/control-schema";

export const prerender = false;

/**
 * El webhook de Stripe.
 *
 * Muy poco código a propósito: verificar está en `lib/stripe/webhook.ts`, traducir el evento en
 * `lib/stripe/events.ts` y decidir si el sitio sirve en `lib/billing.ts`. Aquí sólo queda el
 * pegamento, que es lo único que no se puede probar sin desplegar.
 *
 * Qué se responde y por qué importa: Stripe reintenta durante días todo lo que no sea 2xx. Un
 * evento que no nos incumbe —otro producto, un cliente que no es inquilino, un tipo que no
 * miramos— tiene que salir con 200, o se queda reintentándose eternamente y acaba
 * deshabilitando el endpoint. 400 se reserva para lo que de verdad está mal: la firma.
 */
export const POST: APIRoute = async (context) => {
  const env = context.locals.env;
  const secret = env.STRIPE_WEBHOOK_SECRET;
  const controlUrl = env.CONTROL_DATABASE_URL;

  if (!controlUrl) {
    return new Response("Sin plano de control en este despliegue.", { status: 501 });
  }

  // El cuerpo crudo. Volver a serializar el JSON cambiaría un espacio y con él la firma.
  const payload = await context.request.text();
  const verified = await verifyStripeSignature(
    payload,
    context.request.headers.get("stripe-signature"),
    secret ?? ""
  );

  if (!verified.ok) {
    // Sin detalle en el cuerpo: es lo único que un atacante puede provocar a voluntad, y
    // decirle en qué ha fallado le ahorra trabajo.
    console.error("[stripe] firma rechazada:", verified.reason);
    return new Response("Firma inválida.", { status: 400 });
  }

  const now = new Date();
  const reading = interpret(verified.event, now);
  if (!reading.handled) {
    return Response.json({ ignored: reading.reason });
  }

  const { update } = reading;
  const control = createControlDb(controlUrl, env.CONTROL_AUTH_TOKEN);

  const tenant = await control.query.tenants.findFirst({
    where: eq(tenants.billingRef, update.customerId),
  });
  if (!tenant) {
    // Un cliente de Stripe que no es inquilino nuestro. 200: no hay nada que reintentar.
    return Response.json({ ignored: `Ningún inquilino con billingRef ${update.customerId}.` });
  }

  /*
   * Descartar lo que llega tarde.
   *
   * Stripe no garantiza el orden. Un `payment_failed` que llegue después del `invoice.paid` que
   * lo resolvió dejaría al cliente en impago y, al aplicar la política, suspendido — habiendo
   * pagado.
   */
  if (tenant.billingEventAt && update.eventAt <= tenant.billingEventAt) {
    return Response.json({ ignored: "Evento anterior al último aplicado." });
  }

  await control
    .update(tenants)
    .set({
      billingStatus: update.billingStatus,
      billingEventAt: update.eventAt,
      ...(update.trialEndsAt !== undefined ? { trialEndsAt: update.trialEndsAt } : {}),
      ...(update.graceUntil !== undefined ? { graceUntil: update.graceUntil } : {}),
    })
    .where(eq(tenants.id, tenant.id));

  /*
   * Aplicar la política aquí mismo, y no esperar al cron.
   *
   * Es la diferencia entre que un cliente que acaba de pagar recupere su web en el momento y
   * que la recupere cuando toque el cron. En la otra dirección el margen ya hace su trabajo:
   * nadie se queda sin sitio por un cobro fallido de hace un minuto.
   */
  const fresh = (await control.query.tenants.findFirst({ where: eq(tenants.id, tenant.id) }))!;
  const decision = decide(fresh, now);

  if (decision.changed) {
    await control
      .update(tenants)
      .set({
        status: decision.status,
        suspendedAt: decision.status === "suspended" ? now : null,
        suspendedReason: decision.reason,
      })
      .where(eq(tenants.id, tenant.id));

    // Para que el cambio se note ya en este isolate. Los demás, por el TTL.
    const hosts = await control.query.domains.findMany({
      where: eq(domains.tenantId, tenant.id),
      columns: { host: true },
    });
    for (const row of hosts) forgetTenant(row.host);
  }

  return Response.json({
    tenant: tenant.slug,
    billingStatus: update.billingStatus,
    status: decision.changed ? decision.status : fresh.status,
  });
};
