import { and, eq } from "drizzle-orm";
import { operators, operatorTenants, tenants } from "@db/control-schema";
import type { ControlDatabase } from "@db/control-client";
import { slugify } from "@lib/id";

/**
 * Quién puede usar el panel de inquilinos, y sobre cuáles.
 *
 * Dos comprobaciones distintas que es fácil confundir en una:
 *
 *  - **Autenticación**: quién eres. La lleva Better Auth contra la base de la aplicación, la
 *    misma que el backoffice, porque montar un segundo sistema de cuentas para media docena de
 *    personas sería más superficie de ataque que producto.
 *  - **Autorización**: si además eres operador, y de qué inquilinos. Ésa vive en el plano de
 *    control, y es la que importa: una cuenta del backoffice sin fila en `operators` entra en
 *    su sitio y no ve el panel.
 */

export type Operator = {
  id: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
};

/**
 * Por qué el dominio del panel no puede pertenecer a un inquilino.
 *
 * La sesión se valida contra la base a la que resuelve el dominio de la petición. Si el dominio
 * del panel estuviera mapeado a un inquilino, quien administrase ese inquilino podría crearse
 * una cuenta en *su* base y aparecer aquí autenticado. El panel se sirve desde un dominio sin
 * mapear, y si no lo está se niega en vez de confiar.
 */
export const PANEL_HOST_MUST_BE_UNMAPPED =
  "El panel no puede servirse desde un dominio asignado a un inquilino: la sesión se validaría " +
  "contra la base de ese cliente. Usa un dominio sin mapear.";

export async function findOperator(
  control: ControlDatabase,
  email: string
): Promise<Operator | null> {
  const row = await control.query.operators.findFirst({
    where: eq(operators.email, email.trim().toLowerCase()),
  });
  // Una cuenta desactivada es lo mismo que no tenerla: no basta con quitarle los inquilinos,
  // porque un super admin no los tiene listados.
  if (!row || row.disabled) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isSuperAdmin: row.isSuperAdmin,
  };
}

/** Los inquilinos que ve. `null` significa todos, que es lo que es un super admin. */
export async function visibleTenantIds(
  control: ControlDatabase,
  operator: Operator
): Promise<string[] | null> {
  if (operator.isSuperAdmin) return null;
  const rows = await control.query.operatorTenants.findMany({
    where: eq(operatorTenants.operatorId, operator.id),
    columns: { tenantId: true },
  });
  return rows.map((row) => row.tenantId);
}

export async function canManage(
  control: ControlDatabase,
  operator: Operator,
  tenantId: string
): Promise<boolean> {
  if (operator.isSuperAdmin) return true;
  const row = await control.query.operatorTenants.findFirst({
    where: and(
      eq(operatorTenants.operatorId, operator.id),
      eq(operatorTenants.tenantId, tenantId)
    ),
  });
  return Boolean(row);
}

/**
 * Sólo un super admin crea inquilinos.
 *
 * Administrar el sitio de un cliente y poder dar de alta clientes nuevos son dos cosas
 * distintas, y la segunda cuesta dinero: cada inquilino es una base de datos.
 */
export function canCreateTenants(operator: Operator): boolean {
  return operator.isSuperAdmin;
}

/**
 * El slug del inquilino: va en la URL del panel y en el nombre de su base de datos.
 *
 * Reutiliza el `slugify` del proyecto en vez de escribir otro — dos funciones que quitan
 * acentos de formas ligeramente distintas es cómo un inquilino acaba con una URL y una base
 * que no se llaman igual. Lo único que añade es el tope: Turso limita el nombre de la base, y
 * `databaseName` le pone además un prefijo.
 */
export function tenantSlug(input: string): string {
  return slugify(input).slice(0, 40).replace(/-+$/, "");
}

/** Los inquilinos que este operador puede ver, ya resueltos. */
export async function listTenantsFor(control: ControlDatabase, operator: Operator) {
  const visible = await visibleTenantIds(control, operator);
  const rows = await control.query.tenants.findMany({ with: { domains: true } });
  if (visible === null) return rows;
  const allowed = new Set(visible);
  return rows.filter((tenant) => allowed.has(tenant.id));
}

/** Un inquilino por slug, ya comprobado que este operador puede verlo. */
export async function tenantForOperator(
  control: ControlDatabase,
  operator: Operator,
  slug: string
) {
  const tenant = await control.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    with: { domains: true },
  });
  if (!tenant) return null;
  // «No existe» y no «no puedes»: lo segundo confirma que existe un inquilino con ese slug.
  return (await canManage(control, operator, tenant.id)) ? tenant : null;
}
