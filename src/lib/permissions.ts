import { eq, and, or, isNull } from "drizzle-orm";
import type { Database } from "@db/client";
import { roleContentPermissions, roles } from "@db/schema";

type Action = "view" | "create" | "edit" | "delete" | "publish";

export async function checkPermission(
  db: Database,
  userId: string,
  siteId: string,
  contentTypeId: string,
  action: Action
): Promise<boolean> {
  const userRole = await db.query.roles.findFirst({
    where: and(eq(roles.siteId, siteId)),
  });

  if (!userRole) return false;

  const perm = await db.query.roleContentPermissions.findFirst({
    where: and(
      eq(roleContentPermissions.roleId, userRole.id),
      or(
        eq(roleContentPermissions.contentTypeId, contentTypeId),
        isNull(roleContentPermissions.contentTypeId)
      )
    ),
  });

  if (!perm) return false;

  switch (action) {
    case "view":    return perm.canView;
    case "create":  return perm.canCreate;
    case "edit":    return perm.canEdit;
    case "delete":  return perm.canDelete;
    case "publish": return perm.canPublish;
  }
}
