import { and, eq } from "drizzle-orm";
import { createDb, type Database } from "@db/client";
import { users, userRoles, roles } from "@db/schema";
import { domains, type tenants } from "@db/control-schema";
import type { ControlDatabase } from "@db/control-client";

/**
 * Entrar en la base de un inquilino desde el panel.
 *
 * Es la pieza que el panel no tenía. Hasta ahora sólo escribía en el plano de control —quién
 * existe, en qué dominio, si paga— y nada de eso toca el contenido de nadie. Administrar al
 * usuario de un cliente sí: hay que abrir *su* base, porque ahí es donde vive su gente.
 *
 * Que la conexión se construya aquí y no en cada action es lo que evita que alguna acabe
 * escribiendo en la base compartida creyendo que escribe en la del cliente — que con base
 * compartida ni siquiera fallaría, sólo crearía el usuario en el sitio equivocado.
 */

export type TenantRow = typeof tenants.$inferSelect;

export type TenantConnection = {
  db: Database;
  /** El id del sitio dentro de *esa* base. Sigue haciendo falta: la compartida tiene varios. */
  siteId: string;
  /** Si tiene base propia. Cambia qué se puede prometer sobre el aislamiento. */
  ownDatabase: boolean;
  /**
   * El dominio principal, para los enlaces que se le mandan a esa persona.
   *
   * Nulo cuando el inquilino todavía no tiene ninguno, y entonces no se puede mandar un enlace
   * de acceso: apuntaría al panel, que es un sitio donde su cuenta no existe.
   */
  primaryHost: string | null;
};

/** El dominio al que apuntan los enlaces: el marcado como principal, o el primero que haya. */
export async function primaryHostOf(
  control: ControlDatabase,
  tenantId: string
): Promise<string | null> {
  const rows = await control.query.domains.findMany({
    where: eq(domains.tenantId, tenantId),
    columns: { host: true, isPrimary: true },
  });
  if (!rows.length) return null;
  return (rows.find((row) => row.isPrimary) ?? rows[0]!).host;
}

export async function connectTenant(
  control: ControlDatabase,
  tenant: TenantRow,
  env: { TURSO_DATABASE_URL?: string; TURSO_AUTH_TOKEN?: string }
): Promise<TenantConnection> {
  const own = Boolean(tenant.databaseUrl);

  if (!own && !env.TURSO_DATABASE_URL) {
    throw new Error("TURSO_DATABASE_URL no está configurada y este inquilino usa la compartida.");
  }

  const db = own
    ? createDb(tenant.databaseUrl!, tenant.databaseAuthToken ?? undefined)
    : createDb(env.TURSO_DATABASE_URL!, env.TURSO_AUTH_TOKEN);

  return {
    db,
    siteId: tenant.siteId,
    ownDatabase: own,
    primaryHost: await primaryHostOf(control, tenant.id),
  };
}

/**
 * Una contraseña que se enseña una vez.
 *
 * Existe porque la otra vía —mandar un enlace— depende de que el inquilino tenga Resend
 * configurado y un dominio mapeado, y montar el primer administrador es justo el momento en
 * que puede que no tenga ninguna de las dos. Sin esto, dar de alta a un cliente se queda
 * bloqueado esperando a una configuración de correo.
 *
 * Sin caracteres ambiguos: esto se dicta por teléfono o se pega en un mensaje, y una `l` que
 * parece un `1` convierte un alta en una llamada de soporte.
 */
export function generatePassword(length = 16): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  /*
   * Se descartan los bytes que caen en la cola, en vez de doblarlos con `%`.
   *
   * Con 57 caracteres y 256 valores, el resto no reparte igual: los 28 primeros del alfabeto
   * saldrían algo más a menudo. Sobre dieciséis caracteres la pérdida de entropía es mínima,
   * pero es un generador de contraseñas y hacerlo bien cuesta tres líneas.
   */
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  const out: string[] = [];

  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte >= limit) continue;
      out.push(alphabet[byte % alphabet.length]!);
      if (out.length === length) break;
    }
  }

  return out.join("");
}

export type TenantPerson = {
  id: string;
  email: string;
  name: string;
  disabled: boolean;
  role: string | null;
};

/**
 * La gente de un inquilino.
 *
 * Vive aquí y no dentro de la action porque es la consulta que se equivocó: escrita como un
 * `leftJoin` desde `users`, en base compartida devolvía los correos de la gente de todos los
 * demás clientes que comparten esa base. Fuera de la action se puede probar contra dos sitios
 * de verdad en una misma base, que es la única forma de que ese fallo no vuelva.
 *
 * Las dos ramas no son un caso especial, son dos modelos distintos:
 *
 *  - **Base propia**: todo el que esté dentro es de este inquilino, así que salen todos —
 *    incluido quien se haya quedado sin rol, que es justo el estado que hay que arreglar y que
 *    no se arregla si no se ve.
 *  - **Base compartida**: `users` no lleva `siteId` a propósito, porque una persona puede
 *    administrar dos sitios. Lo que acota es `user_roles`, así que sólo sale quien tenga rol
 *    aquí.
 */
export async function listTenantPeople(
  db: Database,
  siteId: string,
  ownDatabase: boolean
): Promise<TenantPerson[]> {
  const columns = {
    id: users.id,
    email: users.email,
    name: users.name,
    disabled: users.disabled,
    roleKey: roles.key,
  };

  const rows = ownDatabase
    ? await db
        .select(columns)
        .from(users)
        .leftJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.siteId, siteId)))
        .leftJoin(roles, eq(roles.id, userRoles.roleId))
    : await db
        .select(columns)
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(eq(userRoles.siteId, siteId));

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name ?? "",
    disabled: Boolean(row.disabled),
    role: row.roleKey ?? null,
  }));
}

/**
 * Si esa persona es de este inquilino.
 *
 * Con base propia lo es por construcción. Con base compartida hay que comprobarlo, y no hacerlo
 * era una escalada: quien administra un cliente podía restablecer la contraseña del
 * administrador de otro pasando su id, porque las acciones buscaban al usuario sólo por id.
 */
export async function isTenantMember(
  db: Database,
  siteId: string,
  ownDatabase: boolean,
  userId: string
): Promise<boolean> {
  const person = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true },
  });
  if (!person) return false;
  if (ownDatabase) return true;

  const membership = await db.query.userRoles.findFirst({
    where: and(eq(userRoles.userId, userId), eq(userRoles.siteId, siteId)),
  });
  return Boolean(membership);
}
