import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { and, eq } from "drizzle-orm";
import { tenants, domains, TENANT_STATUS, BILLING_STATUS } from "@db/control-schema";
import { decide, addDays, GRACE_DAYS, TRIAL_DAYS } from "@lib/billing";
import type { ControlDatabase } from "@db/control-client";
import {
  findOperator,
  canManage,
  canCreateTenants,
  tenantSlug,
  PANEL_HOST_MUST_BE_UNMAPPED,
  type Operator,
} from "@lib/panel";
import { normaliseHost } from "@lib/site";
import { forgetTenant } from "@lib/tenant";
import { generateId } from "@lib/id";

/**
 * El panel de inquilinos.
 *
 * Escribe en el plano de control, nunca en la base de un cliente. Crear la base de datos de un
 * inquilino no está aquí y no es un descuido: migrar lee la carpeta `drizzle/` del disco, que
 * dentro del Worker no existe. Reimplementar el migrador de drizzle para poder hacerlo desde
 * aquí sería otro migrador que puede desincronizarse del de verdad, y el precio de esa
 * divergencia lo paga la base de un cliente. Así que el panel crea el inquilino y dice qué
 * comando lanzar.
 */

type PanelContext = { control: ControlDatabase; operator: Operator };

/**
 * Quién llama, comprobado dos veces.
 *
 * Autenticado contra la base de la aplicación, y operador según el plano de control. Lo segundo
 * es lo que decide: una cuenta del backoffice sin fila en `operators` no ve nada de esto.
 */
async function requireOperator(context: {
  locals: { control: ControlDatabase | null; user: { email: string } | null; tenant: { tenantId: string | null } };
}): Promise<PanelContext> {
  if (!context.locals.control) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "El plano de control no está configurado en este despliegue.",
    });
  }
  // Si el dominio del panel perteneciera a un inquilino, la sesión se habría validado contra la
  // base de ese cliente, y quien la administra podría crearse una cuenta y aparecer aquí.
  if (context.locals.tenant.tenantId) {
    throw new ActionError({ code: "FORBIDDEN", message: PANEL_HOST_MUST_BE_UNMAPPED });
  }
  if (!context.locals.user) {
    throw new ActionError({ code: "UNAUTHORIZED", message: "Sin sesión." });
  }

  const operator = await findOperator(context.locals.control, context.locals.user.email);
  if (!operator) {
    throw new ActionError({ code: "FORBIDDEN", message: "Tu cuenta no es operadora." });
  }
  return { control: context.locals.control, operator };
}

/** El inquilino, o un «no existe» que no confirma que exista. */
async function requireTenant(panel: PanelContext, tenantId: string) {
  const tenant = await panel.control.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  if (!tenant || !(await canManage(panel.control, panel.operator, tenant.id))) {
    throw new ActionError({ code: "NOT_FOUND", message: "Ese inquilino no existe." });
  }
  return tenant;
}

export const panelActions = {
  create: defineAction({
    accept: "json",
    input: z.object({
      name: z.string().trim().min(2, "Ponle un nombre."),
      slug: z.string().trim().optional(),
    }),
    handler: async (input, context) => {
      const panel = await requireOperator(context as never);
      if (!canCreateTenants(panel.operator)) {
        // Administrar el sitio de un cliente y dar de alta clientes nuevos son cosas distintas,
        // y la segunda cuesta una base de datos.
        throw new ActionError({
          code: "FORBIDDEN",
          message: "Sólo un super admin puede crear inquilinos.",
        });
      }

      const slug = tenantSlug(input.slug?.trim() || input.name);
      if (!slug) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "De ese nombre no sale ningún slug. Escribe uno a mano.",
        });
      }

      const clash = await panel.control.query.tenants.findFirst({
        where: eq(tenants.slug, slug),
      });
      if (clash) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `Ya hay un inquilino con el slug «${slug}».`,
        });
      }

      const id = generateId("t");
      await panel.control.insert(tenants).values({
        id,
        name: input.name.trim(),
        slug,
        // Nace sin servir. La base todavía no existe, y un dominio que resolviera ahora
        // enseñaría una base vacía.
        status: "provisioning",
        siteId: "site_default",
      });

      return { id, slug };
    },
  }),

  mapDomain: defineAction({
    accept: "json",
    input: z.object({
      tenantId: z.string(),
      host: z.string().trim().min(3),
      primary: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const panel = await requireOperator(context as never);
      const tenant = await requireTenant(panel, input.tenantId);
      const host = normaliseHost(input.host);

      if (!/^[a-z0-9.-]+\.[a-z]{2,}$|^[a-z0-9-]+\.localhost$/.test(host)) {
        throw new ActionError({ code: "BAD_REQUEST", message: `«${host}» no parece un dominio.` });
      }

      const taken = await panel.control.query.domains.findFirst({
        where: eq(domains.host, host),
      });
      if (taken && taken.tenantId !== tenant.id) {
        // Dos inquilinos reclamando un host no es un conflicto que una petición pueda resolver,
        // así que se para al escribir y no al resolver.
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `«${host}» ya está asignado a otro inquilino.`,
        });
      }

      const primary = input.primary ?? false;
      if (primary) {
        await panel.control
          .update(domains)
          .set({ isPrimary: false })
          .where(eq(domains.tenantId, tenant.id));
      }
      await panel.control
        .insert(domains)
        .values({ host, tenantId: tenant.id, isPrimary: primary })
        .onConflictDoUpdate({ target: domains.host, set: { isPrimary: primary } });

      // Para que quien lo acaba de mapear lo vea ya. Los demás isolates se enteran por el TTL:
      // no hay canal entre ellos, y prometer más sería mentir.
      forgetTenant(host);

      return { host };
    },
  }),

  unmapDomain: defineAction({
    accept: "json",
    input: z.object({ tenantId: z.string(), host: z.string() }),
    handler: async (input, context) => {
      const panel = await requireOperator(context as never);
      const tenant = await requireTenant(panel, input.tenantId);
      const host = normaliseHost(input.host);

      await panel.control
        .delete(domains)
        .where(and(eq(domains.host, host), eq(domains.tenantId, tenant.id)));
      forgetTenant(host);
      return { host };
    },
  }),

  setBilling: defineAction({
    accept: "json",
    input: z.object({
      tenantId: z.string(),
      /** `null` saca al inquilino de la facturación: la política deja de tocarlo. */
      billingStatus: z.enum(BILLING_STATUS).nullable(),
      days: z.number().int().min(-3650).max(3650).optional(),
      ref: z.string().trim().optional(),
    }),
    handler: async (input, context) => {
      const panel = await requireOperator(context as never);
      const tenant = await requireTenant(panel, input.tenantId);
      const now = new Date();

      if (input.billingStatus === null) {
        await panel.control
          .update(tenants)
          .set({ billingStatus: null, trialEndsAt: null, graceUntil: null })
          .where(eq(tenants.id, tenant.id));
        return { billingStatus: null, willChangeTo: null };
      }

      /*
       * Las fechas se derivan del estado al que entra.
       *
       * Pedirlas aparte es cómo un inquilino acaba en impago sin margen y suspendido esa misma
       * noche — el dato que falta no puede ser el que decide.
       */
      const dates =
        input.billingStatus === "trialing"
          ? { trialEndsAt: addDays(now, input.days ?? TRIAL_DAYS), graceUntil: null }
          : input.billingStatus === "past_due"
            ? { graceUntil: addDays(now, input.days ?? GRACE_DAYS) }
            : input.billingStatus === "paid"
              ? { graceUntil: null }
              : {};

      await panel.control
        .update(tenants)
        .set({
          billingStatus: input.billingStatus,
          ...(input.ref ? { billingRef: input.ref } : {}),
          ...dates,
        })
        .where(eq(tenants.id, tenant.id));

      // Se dice qué va a pasar, pero no se hace aquí: cambiar el cobro y apagar un sitio son
      // dos decisiones, y juntarlas es cómo se suspende a alguien sin querer.
      const updated = (await panel.control.query.tenants.findFirst({
        where: eq(tenants.id, tenant.id),
      }))!;
      const next = decide(updated, now);

      return {
        billingStatus: input.billingStatus,
        willChangeTo: next.changed ? next.status : null,
      };
    },
  }),

  setStatus: defineAction({
    accept: "json",
    input: z.object({
      tenantId: z.string(),
      status: z.enum(TENANT_STATUS),
      reason: z.string().trim().optional(),
    }),
    handler: async (input, context) => {
      const panel = await requireOperator(context as never);
      const tenant = await requireTenant(panel, input.tenantId);

      if (input.status === "active" && !tenant.databaseUrl) {
        /*
         * Activar un inquilino sin base propia es legítimo —el modelo de base compartida— pero
         * sólo si su sitio existe dentro de la compartida. Lo que no puede pasar es activarlo
         * justo después de crearlo desde el panel, porque ahí no hay ni base ni sitio, y el
         * dominio empezaría a servir una página en blanco.
         */
        if (tenant.status === "provisioning") {
          throw new ActionError({
            code: "BAD_REQUEST",
            message:
              "Este inquilino todavía no tiene base de datos. Créala primero:\n" +
              `  npm run provision -- new ${tenant.slug}`,
          });
        }
      }

      await panel.control
        .update(tenants)
        .set({
          status: input.status,
          suspendedAt: input.status === "suspended" ? new Date() : null,
          suspendedReason: input.status === "suspended" ? input.reason || null : null,
        })
        .where(eq(tenants.id, tenant.id));

      // Sus dominios cambian de comportamiento, así que la caché de este isolate sobra.
      const hosts = await panel.control.query.domains.findMany({
        where: eq(domains.tenantId, tenant.id),
        columns: { host: true },
      });
      for (const row of hosts) forgetTenant(row.host);

      return { status: input.status };
    },
  }),
};
