import { forbidden } from "@lib/errors";
import { eq, and, or, isNull } from "drizzle-orm";
import type { Database } from "@db/client";
import { userRoles, roleContentPermissions, contentTypes } from "@db/schema";

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

  // A row for this exact content type overrides the wildcard entirely — that is how an
  // admin narrows a broad grant for one type. Failing that, the wildcards apply.
  //
  // Nothing stops a role from having two wildcard rows: there is no unique index on
  // (roleId, contentTypeId) and setPermission does find-then-insert. Reading only the
  // first row the database returned made the answer depend on SQLite's row order, so
  // the wildcards are combined additively instead: a grant in any of them grants.
  const specific = perms.find((p) => p.contentTypeId === contentTypeId);
  const applicable = specific ? [specific] : perms;

  switch (action) {
    case "view":    return applicable.some((p) => p.canView);
    case "create":  return applicable.some((p) => p.canCreate);
    case "edit":    return applicable.some((p) => p.canEdit);
    case "delete":  return applicable.some((p) => p.canDelete);
    case "publish": return applicable.some((p) => p.canPublish);
  }
}

/**
 * Throws if the user doesn't have the required permission.
 * Use in action handlers after confirming the user is authenticated.
 *
 * `AppError` and not a plain `Error`: a plain one came out of every action as a 500, which told
 * the caller "I broke" instead of "you cannot". `actions/_define.ts` turns this into a 403 and
 * the MCP handler into its own refusal — neither of them by sniffing the message, which is what
 * they used to do.
 *
 * This is for a user who may not do something *on this site*. When the thing belongs to another
 * tenant the answer is «not found», never this one: «you cannot» already confirms it exists.
 */
export async function requirePermission(
  db: Database,
  userId: string,
  siteId: string,
  contentTypeId: string,
  action: Action
): Promise<void> {
  const ok = await checkPermission(db, userId, siteId, contentTypeId, action);
  if (!ok) throw forbidden(`No tienes permiso de «${action}» sobre este tipo de contenido.`);
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
    throw forbidden("Se requiere rol de administrador.");
  }
}

/**
 * The content types this user may see, as a set for cheap filtering.
 *
 * Listing endpoints use this instead of asking per row: the web UI and the MCP surface
 * must answer the same question the same way, or the same account gets a different
 * inventory depending on which door it came through.
 */
export async function viewableContentTypeIds(
  db: Database,
  userId: string,
  siteId: string
): Promise<Set<string>> {
  const types = await db.query.contentTypes.findMany({
    where: eq(contentTypes.siteId, siteId),
  });
  const allowed = await Promise.all(
    types.map((ct) => checkPermission(db, userId, siteId, ct.id, "view"))
  );
  return new Set(types.filter((_, i) => allowed[i]).map((ct) => ct.id));
}

/**
 * Media is not typed, so the permission matrix (role x content type) says nothing about
 * it. The rule that does apply: you need a role on this site. Being merely authenticated
 * was enough before, which let any account with a login read the whole media library.
 */
/**
 * Whether the user has any role at all on the site.
 *
 * Pages need the answer to decide what to render; actions need it to refuse. Same query
 * either way, so it lives here once.
 */
export async function hasSiteRole(
  db: Database,
  userId: string,
  siteId: string
): Promise<boolean> {
  const assignment = await db.query.userRoles.findFirst({
    where: and(eq(userRoles.userId, userId), eq(userRoles.siteId, siteId)),
  });
  return !!assignment;
}

export async function requireSiteRole(
  db: Database,
  userId: string,
  siteId: string
): Promise<void> {
  if (!(await hasSiteRole(db, userId, siteId))) {
    throw forbidden("No tienes ningún rol asignado en este sitio.");
  }
}
