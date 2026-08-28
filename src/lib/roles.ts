import type { Database } from "@db/client";
import { and, eq } from "drizzle-orm";
import { roles } from "@db/schema";

/**
 * Role identity, per site.
 *
 * The three roles used to have fixed primary keys — `role_admin`, `role_editor`,
 * `role_collaborator` — which works exactly as long as there is one site. Bootstrapping a second
 * one collides on the primary key, `onConflictDoNothing` swallows it, and the new site ends up
 * with **zero roles**: silently, on every request, and with nobody able to be its administrator
 * because `requireAdmin` can never find one.
 *
 * Verified by running it before changing anything. The id now carries the site.
 */
export const ROLE_KEYS = ["admin", "editor", "collaborator"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: "Admin",
  editor: "Editor",
  collaborator: "Colaborador",
};

/**
 * Deterministic rather than random, so bootstrap stays idempotent: running it twice must not
 * produce a second set of roles for the same site.
 */
export function roleId(siteId: string, key: RoleKey): string {
  return `role_${key}_${siteId}`;
}

/** The three rows a site needs. */
export function rolesForSite(siteId: string) {
  return ROLE_KEYS.map((key) => ({
    id: roleId(siteId, key),
    siteId,
    key,
    label: ROLE_LABELS[key],
  }));
}

/**
 * Looks up a role by key within a site.
 *
 * Prefer this over building the id: the migration left the original site's three rows under
 * their legacy ids, and reading by (siteId, key) is correct for both.
 */
export async function findRole(db: Database, siteId: string, key: RoleKey) {
  return db.query.roles.findFirst({
    where: and(eq(roles.siteId, siteId), eq(roles.key, key)),
  });
}
