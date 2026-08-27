import { eq, and, or, isNull } from "drizzle-orm";
import type { Database } from "@db/client";
import { userRoles, roleContentPermissions } from "@db/schema";

export type Action = "view" | "create" | "edit" | "delete" | "publish";

/**
 * Returns true if the user has the required permission for a content type.
 * Admins always pass. Users with no role assignment are denied.
 * A permission row with contentTypeId = null acts as a wildcard for all types.
 */
export async function checkPermission(
  db: Database,
  userId: string,
  siteId: string,
  contentTypeId: string,
  action: Action
): Promise<boolean> {
  const assignment = await db.query.userRoles.findFirst({
    where: and(eq(userRoles.userId, userId), eq(userRoles.siteId, siteId)),
    with: { role: true },
  });

  if (!assignment) return false;

  if (assignment.role.key === "admin") return true;

  const perms = await db.query.roleContentPermissions.findMany({
    where: and(
      eq(roleContentPermissions.roleId, assignment.role.id),
      or(
        eq(roleContentPermissions.contentTypeId, contentTypeId),
        isNull(roleContentPermissions.contentTypeId)
      )
    ),
  });

  if (perms.length === 0) return false;

  const specific = perms.find((p) => p.contentTypeId === contentTypeId);
  const perm = specific ?? perms[0];

  switch (action) {
    case "view":    return perm.canView;
    case "create":  return perm.canCreate;
    case "edit":    return perm.canEdit;
    case "delete":  return perm.canDelete;
    case "publish": return perm.canPublish;
  }
}

/**
 * Throws if the user doesn't have the required permission.
 * Use in action handlers after confirming the user is authenticated.
 */
export async function requirePermission(
  db: Database,
  userId: string,
  siteId: string,
  contentTypeId: string,
  action: Action
): Promise<void> {
  const ok = await checkPermission(db, userId, siteId, contentTypeId, action);
  if (!ok) throw new Error(`Forbidden: no "${action}" permission for this content type`);
}

/**
 * True only if the user holds the "admin" role on this site.
 *
 * Every "admin only" action must go through this. Checking `locals.user` alone
 * proves authentication, not authorisation: any collaborator with a session
 * would otherwise be able to grant themselves the admin role.
 */
export async function isAdmin(
  db: Database,
  userId: string,
  siteId: string
): Promise<boolean> {
  const assignment = await db.query.userRoles.findFirst({
    where: and(eq(userRoles.userId, userId), eq(userRoles.siteId, siteId)),
    with: { role: true },
  });
  return assignment?.role.key === "admin";
}

export async function requireAdmin(
  db: Database,
  userId: string,
  siteId: string
): Promise<void> {
  if (!(await isAdmin(db, userId, siteId))) {
    throw new Error("Forbidden: se requiere rol de administrador");
  }
}
