import { defineAction, ActionError } from "./_define";
import { z } from "astro:schema";
import { and, eq } from "drizzle-orm";
import { tenants, domains, TENANT_STATUS, BILLING_STATUS } from "@db/control-schema";
import { decide, addDays, GRACE_DAYS, TRIAL_DAYS } from "@lib/billing";
import type { ControlDatabase } from "@db/control-client";
import type { Database } from "@db/client";
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
import {
  connectTenant,
  generatePassword,
  listTenantPeople,
  isTenantMember,
} from "@lib/panel-tenant";
import { createAuth } from "@lib/auth";
import { users, userRoles, roles, settings } from "@db/schema";
import { roleId, ROLE_KEYS } from "@lib/roles";

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

/**
 * La base del inquilino, abierta y comprobada.
 *
 * Se niega mientras se está montando: en `provisioning` puede que la base todavía no exista, y
 * crear un usuario contra la compartida «porque aún no tiene la suya» lo dejaría en el sitio
 * equivocado, invisible desde su propio backoffice y visible desde el de otro.
 */
async function openTenant(panel: PanelContext, tenantId: string, env: RuntimeEnv) {
  const tenant = await requireTenant(panel, tenantId);
  if (tenant.status === "provisioning" && !tenant.databaseUrl) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message:
        "Este inquilino todavía no tiene base de datos, así que no hay dónde crear su gente.\n" +
        `  npm run provision -- new ${tenant.slug}`,
    });
  }
  return { tenant, connection: await connectTenant(panel.control, tenant, env) };
}

/** El guarda por usuario, sobre `isTenantMember`. Devuelve la fila para no releerla. */
async function requireTenantMember(
  connection: { db: Database; siteId: string; ownDatabase: boolean },
  userId: string
) {
  const ok = await isTenantMember(connection.db, connection.siteId, connection.ownDatabase, userId);
  // «No existe» y no «no puedes»: lo segundo confirma que esa cuenta está ahí.
  if (!ok) throw new ActionError({ code: "NOT_FOUND", message: "Esa persona no existe." });
  return (await connection.db.query.users.findFirst({ where: eq(users.id, userId) }))!;
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

  /* ------------------------------------------------ la gente del inquilino */

  listUsers: defineAction({
    accept: "json",
    input: z.object({ tenantId: z.string() }),
    handler: async (input, context) => {
      const panel = await requireOperator(context as never);
      const { tenant, connection } = await openTenant(
        panel,
        input.tenantId,
        (context as never as { locals: { env: RuntimeEnv } }).locals.env
      );
      const { db, siteId } = connection;

      const people = await listTenantPeople(db, siteId, connection.ownDatabase);

      return {
        canEmail: Boolean(connection.primaryHost) && (await hasEmail(db, siteId)),
        primaryHost: connection.primaryHost,
        slug: tenant.slug,
        users: people,
      };
    },
  }),

  createUser: defineAction({
    accept: "json",
    input: z.object({
      tenantId: z.string(),
      email: z.string().trim().email("Eso no es un correo."),
      name: z.string().trim().optional(),
      role: z.enum(ROLE_KEYS).default("admin"),
      /** Vacío = se genera una y se enseña una sola vez. */
      password: z.string().min(8, "Mínimo ocho caracteres.").optional(),
    }),
    handler: async (input, context) => {
      const panel = await requireOperator(context as never);
      const env = (context as never as { locals: { env: RuntimeEnv } }).locals.env;
      const { connection } = await openTenant(panel, input.tenantId, env);
      const { db, siteId } = connection;

      const email = input.email.toLowerCase();
      const existing = await db.query.users.findFirst({ where: eq(users.email, email) });

      if (existing) {
        /*
         * La cuenta ya está en esta base. Dos casos distintos.
         *
         * Con base propia sólo puede ser de este inquilino, así que es un duplicado y se
         * rechaza. Con base compartida puede ser de otro cliente al que esta persona también
         * administra —cosa legítima: `users` no lleva sitio precisamente para permitirlo— y
         * entonces lo que toca es darle acceso aquí, no negarse. Negarse dejaba sin forma de
         * dar de alta a alguien que ya trabajaba en otro sitio de la misma base.
         */
        const here = await db.query.userRoles.findFirst({
          where: and(eq(userRoles.userId, existing.id), eq(userRoles.siteId, siteId)),
        });

        if (connection.ownDatabase || here) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: `Ya hay una cuenta con ${email} en este inquilino.`,
          });
        }

        await db.insert(userRoles).values({
          userId: existing.id,
          roleId: roleId(siteId, input.role),
          siteId,
          assignedAt: new Date(),
        });

        // Sin contraseña: la cuenta ya existía y su dueño tiene la suya. Cambiársela por dar
        // de alta en un segundo sitio le echaría del primero.
        return { id: existing.id, email, role: input.role, password: null, granted: true };
      }

      /*
       * La contraseña se genera si no la dan, y se devuelve una sola vez.
       *
       * La otra vía —mandar un enlace— necesita que el inquilino tenga Resend configurado y un
       * dominio mapeado, y dar de alta al primer administrador es justo cuando puede no tener
       * ninguna de las dos. Sin esto, el alta se queda esperando a una configuración de correo.
       */
      const password = input.password ?? generatePassword();
      const generated = !input.password;

      const auth = createAuth(db, "", "", {
        secret: env.BETTER_AUTH_SECRET,
        ...(connection.primaryHost ? { baseURL: `https://${connection.primaryHost}` } : {}),
      });

      const created = await auth.api.signUpEmail({
        body: { email, password, name: input.name?.trim() || email.split("@")[0]! },
      });

      const role = await db.query.roles.findFirst({
        where: and(eq(roles.siteId, siteId), eq(roles.key, input.role)),
      });
      if (!role) {
        // La base está migrada pero sin sembrar. Decirlo, en vez de dejar una cuenta sin rol
        // que no puede entrar a ninguna parte y no explica por qué.
        throw new ActionError({
          code: "BAD_REQUEST",
          message:
            `La base de este inquilino no tiene el rol «${input.role}». Le falta la siembra ` +
            "inicial: vuelve a lanzar `npm run provision -- new <slug>`, que es idempotente.",
        });
      }

      await db
        .insert(userRoles)
        .values({
          userId: created.user.id,
          roleId: roleId(siteId, input.role),
          siteId,
          assignedAt: new Date(),
        })
        .onConflictDoNothing();

      return {
        id: created.user.id,
        email,
        role: input.role,
        // Sólo cuando la hemos generado nosotros: devolver la que ha escrito quien llama no
        // aporta nada y la deja en un registro más.
        password: generated ? password : null,
        granted: false,
      };
    },
  }),

  setUserRole: defineAction({
    accept: "json",
    input: z.object({
      tenantId: z.string(),
      userId: z.string(),
      /** `null` le quita el rol en este sitio, sin borrar la cuenta. */
      role: z.enum(ROLE_KEYS).nullable(),
    }),
    handler: async (input, context) => {
      const panel = await requireOperator(context as never);
      const env = (context as never as { locals: { env: RuntimeEnv } }).locals.env;
      const { connection } = await openTenant(panel, input.tenantId, env);
      const { db, siteId } = connection;

      await requireTenantMember(connection, input.userId);

      if (input.role === null) {
        await assertNotLastAdmin(db, siteId, input.userId);
        await db
          .delete(userRoles)
          .where(and(eq(userRoles.userId, input.userId), eq(userRoles.siteId, siteId)));
        return { role: null };
      }

      if (input.role !== "admin") await assertNotLastAdmin(db, siteId, input.userId);

      await db
        .insert(userRoles)
        .values({
          userId: input.userId,
          roleId: roleId(siteId, input.role),
          siteId,
          assignedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [userRoles.userId, userRoles.siteId],
          set: { roleId: roleId(siteId, input.role) },
        });

      return { role: input.role };
    },
  }),

  setUserActive: defineAction({
    accept: "json",
    input: z.object({ tenantId: z.string(), userId: z.string(), disabled: z.boolean() }),
    handler: async (input, context) => {
      const panel = await requireOperator(context as never);
      const env = (context as never as { locals: { env: RuntimeEnv } }).locals.env;
      const { connection } = await openTenant(panel, input.tenantId, env);
      const { db, siteId } = connection;

      await requireTenantMember(connection, input.userId);
      if (input.disabled) await assertNotLastAdmin(db, siteId, input.userId);

      await db.update(users).set({ disabled: input.disabled }).where(eq(users.id, input.userId));
      return { disabled: input.disabled };
    },
  }),

  resetPassword: defineAction({
    accept: "json",
    input: z.object({ tenantId: z.string(), userId: z.string() }),
    handler: async (input, context) => {
      const panel = await requireOperator(context as never);
      const env = (context as never as { locals: { env: RuntimeEnv } }).locals.env;
      const { connection } = await openTenant(panel, input.tenantId, env);
      const { db } = connection;

      const person = await requireTenantMember(connection, input.userId);

      const password = generatePassword();
      const auth = createAuth(db, "", "", { secret: env.BETTER_AUTH_SECRET });

      /*
       * Se cambia la contraseña por debajo, no con `changePassword`.
       *
       * `changePassword` pide la actual, que es exactamente lo que no se tiene: quien la pide
       * es el operador, no su dueño. `setPassword` del contexto interno es la vía prevista para
       * esto, y revoca las sesiones abiertas — que es lo correcto: si hay que restablecerla, la
       * sesión que hubiera abierta tampoco es de fiar.
       */
      const ctx = await auth.$context;
      const hash = await ctx.password.hash(password);
      await ctx.internalAdapter.updatePassword(person.id, hash);
      // `deleteUserSessions`, no `deleteSessions`: la segunda recibe tokens de sesión, no un
      // id de usuario, y llamarla con un id borra exactamente nada.
      await ctx.internalAdapter.deleteUserSessions(person.id);

      return { email: person.email, password };
    },
  }),

  sendAccessLink: defineAction({
    accept: "json",
    input: z.object({ tenantId: z.string(), userId: z.string() }),
    handler: async (input, context) => {
      const panel = await requireOperator(context as never);
      const env = (context as never as { locals: { env: RuntimeEnv } }).locals.env;
      const { connection } = await openTenant(panel, input.tenantId, env);
      const { db, siteId, primaryHost } = connection;

      if (!primaryHost) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message:
            "Este inquilino no tiene ningún dominio, así que el enlace no llevaría a su sitio. " +
            "Asígnale uno primero.",
        });
      }

      const person = await requireTenantMember(connection, input.userId);

      // La clave de Resend es de *su* sitio, no del panel: el correo lo manda el cliente desde
      // su propio remitente, y usar el nuestro es cómo un aviso acaba en spam.
      const row = await db.query.settings.findFirst({ where: eq(settings.siteId, siteId) });
      const integrations = (row?.integrations as Record<string, string> | null) ?? {};
      if (!integrations.resendApiKey) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message:
            "Este inquilino no tiene clave de Resend en sus ajustes, así que no se puede mandar " +
            "el correo. Usa «restablecer contraseña» y pásasela tú.",
        });
      }

      const auth = createAuth(db, integrations.resendApiKey, integrations.resendFrom, {
        secret: env.BETTER_AUTH_SECRET,
        baseURL: `https://${primaryHost}`,
      });

      // `headers` es obligatorio en la firma aunque aquí no venga de ninguna petición de esa
      // persona: quien pide el enlace es el operador desde el panel.
      await auth.api.signInMagicLink({
        body: { email: person.email, callbackURL: "/admin" },
        headers: new Headers(),
      });

      return { email: person.email, host: primaryHost };
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

/**
 * Que no se quede sin administrador.
 *
 * El error más caro de este panel no es dar un permiso de más: es quitar el último de menos y
 * dejar el sitio de un cliente sin nadie que pueda entrar a administrarlo. Recuperarlo pide una
 * terminal, que es justo lo que este panel existe para no necesitar.
 */
async function assertNotLastAdmin(db: Database, siteId: string, userId: string) {
  const admins = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.siteId, siteId), eq(roles.key, "admin")));

  const others = admins.filter((row) => row.userId !== userId);
  if (admins.some((row) => row.userId === userId) && others.length === 0) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message:
        "Es la única cuenta con rol de administrador en este sitio. Crea otra antes de " +
        "quitarle el rol o desactivarla, o el cliente se queda sin poder entrar.",
    });
  }
}

/** Si el inquilino puede mandar correo con su propio remitente. */
async function hasEmail(db: Database, siteId: string): Promise<boolean> {
  const row = await db.query.settings.findFirst({ where: eq(settings.siteId, siteId) });
  const integrations = (row?.integrations as Record<string, string> | null) ?? {};
  return Boolean(integrations.resendApiKey);
}
