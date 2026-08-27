import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createDb, type Database } from "@db/client";
import { sites, contentTypes, roles, roleContentPermissions, userRoles, users } from "@db/schema";
import { checkPermission, isAdmin, requireAdmin, requirePermission } from "./permissions";

const SITE = "site_test";

/**
 * A real libSQL database in memory with the actual migrations applied, rather than a
 * hand-rolled fake. checkPermission does part of its filtering in SQL — the
 * `or(contentTypeId = x, contentTypeId is null)` clause — and a fake would have to
 * reimplement exactly that, which is the part most likely to be wrong.
 */
async function freshDb(): Promise<Database> {
  const db = createDb(":memory:");
  const dir = resolve(process.cwd(), "drizzle");

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(resolve(dir, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await db.run(trimmed);
    }
  }

  await db.insert(sites).values({ id: SITE, name: "Test" });
  await db.insert(contentTypes).values([
    { id: "ct_page", siteId: SITE, key: "page", label: "Página" },
    { id: "ct_post", siteId: SITE, key: "post", label: "Post" },
  ]);
  await db.insert(roles).values([
    { id: "r_admin", siteId: SITE, key: "admin", label: "Admin" },
    { id: "r_editor", siteId: SITE, key: "editor", label: "Editor" },
  ]);
  await db.insert(users).values([
    { id: "u_admin", name: "A", email: "a@test" },
    { id: "u_editor", name: "E", email: "e@test" },
    { id: "u_nobody", name: "N", email: "n@test" },
  ]);
  await db.insert(userRoles).values([
    { userId: "u_admin", roleId: "r_admin", siteId: SITE },
    { userId: "u_editor", roleId: "r_editor", siteId: SITE },
  ]);
  return db;
}

let db: Database;
beforeEach(async () => {
  db = await freshDb();
});

const perm = (over: Partial<typeof roleContentPermissions.$inferInsert>) => ({
  id: `p_${Math.random().toString(36).slice(2)}`,
  roleId: "r_editor",
  contentTypeId: null,
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canPublish: false,
  ...over,
});

describe("checkPermission", () => {
  it("denies a user with no role on this site", async () => {
    expect(await checkPermission(db, "u_nobody", SITE, "ct_page", "view")).toBe(false);
  });

  it("denies a user whose role exists on another site", async () => {
    expect(await checkPermission(db, "u_editor", "site_other", "ct_page", "view")).toBe(false);
  });

  it("grants an admin everything, with no permission rows at all", async () => {
    for (const action of ["view", "create", "edit", "delete", "publish"] as const) {
      expect(await checkPermission(db, "u_admin", SITE, "ct_page", action)).toBe(true);
    }
  });

  it("denies a non-admin role that has no rows", async () => {
    expect(await checkPermission(db, "u_editor", SITE, "ct_page", "edit")).toBe(false);
  });

  it("honours each flag of a type-specific row independently", async () => {
    await db.insert(roleContentPermissions).values(
      perm({ contentTypeId: "ct_page", canView: true, canEdit: true })
    );
    expect(await checkPermission(db, "u_editor", SITE, "ct_page", "view")).toBe(true);
    expect(await checkPermission(db, "u_editor", SITE, "ct_page", "edit")).toBe(true);
    expect(await checkPermission(db, "u_editor", SITE, "ct_page", "publish")).toBe(false);
    expect(await checkPermission(db, "u_editor", SITE, "ct_page", "delete")).toBe(false);
  });

  it("does not leak a row for one content type onto another", async () => {
    await db.insert(roleContentPermissions).values(
      perm({ contentTypeId: "ct_page", canView: true, canEdit: true })
    );
    expect(await checkPermission(db, "u_editor", SITE, "ct_post", "view")).toBe(false);
  });

  it("applies a wildcard row to every content type", async () => {
    await db.insert(roleContentPermissions).values(perm({ contentTypeId: null, canView: true }));
    expect(await checkPermission(db, "u_editor", SITE, "ct_page", "view")).toBe(true);
    expect(await checkPermission(db, "u_editor", SITE, "ct_post", "view")).toBe(true);
  });

  it("lets a type-specific row override the wildcard, in both directions", async () => {
    await db.insert(roleContentPermissions).values([
      perm({ contentTypeId: null, canView: true, canEdit: true }),
      perm({ contentTypeId: "ct_post", canView: true, canEdit: false }),
    ]);
    expect(await checkPermission(db, "u_editor", SITE, "ct_page", "edit")).toBe(true);
    expect(await checkPermission(db, "u_editor", SITE, "ct_post", "edit")).toBe(false);
  });

  it("is deterministic when a role somehow has two wildcard rows", async () => {
    // Nothing in the schema stops this: there is no unique index on
    // (roleId, contentTypeId) and setPermission does find-then-insert. Picking the
    // first row the database happened to return made the effective permission depend
    // on SQLite's row order.
    await db.insert(roleContentPermissions).values([
      perm({ contentTypeId: null, canView: true, canEdit: false }),
      perm({ contentTypeId: null, canView: false, canEdit: true }),
    ]);
    expect(await checkPermission(db, "u_editor", SITE, "ct_page", "view")).toBe(true);
    expect(await checkPermission(db, "u_editor", SITE, "ct_page", "edit")).toBe(true);
    expect(await checkPermission(db, "u_editor", SITE, "ct_page", "delete")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("resolves silently when allowed", async () => {
    await expect(
      requirePermission(db, "u_admin", SITE, "ct_page", "edit")
    ).resolves.toBeUndefined();
  });

  it("throws naming the action, so the UI can say what is missing", async () => {
    await expect(
      requirePermission(db, "u_editor", SITE, "ct_page", "publish")
    ).rejects.toThrow(/publish/);
  });
});

describe("isAdmin / requireAdmin", () => {
  it("is true only for the admin role", async () => {
    expect(await isAdmin(db, "u_admin", SITE)).toBe(true);
    expect(await isAdmin(db, "u_editor", SITE)).toBe(false);
    expect(await isAdmin(db, "u_nobody", SITE)).toBe(false);
  });

  it("does not treat a wildcard grant as the admin role", async () => {
    // The escalation this guards: an editor with every permission on every type is
    // still not an admin, and must not be able to hand out roles.
    await db.insert(roleContentPermissions).values(
      perm({
        contentTypeId: null,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canPublish: true,
      })
    );
    expect(await isAdmin(db, "u_editor", SITE)).toBe(false);
    await expect(requireAdmin(db, "u_editor", SITE)).rejects.toThrow(/administrador/);
  });

  it("is scoped to the site", async () => {
    expect(await isAdmin(db, "u_admin", "site_other")).toBe(false);
  });
});
