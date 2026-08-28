import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb, type Database } from "@db/client";
import { users, userRoles } from "@db/schema";
import { applyBaseline } from "@db/baseline";
import { roleId } from "@lib/roles";
import { listTenantPeople, isTenantMember, generatePassword } from "./panel-tenant";

/**
 * Quién ve el panel de un inquilino, con dos sitios de verdad en una misma base.
 *
 * Estos dos casos existen porque los dos fallaron. Escrito la primera vez con un `leftJoin`
 * desde `users`, el listado de un inquilino con base compartida devolvía los correos de la
 * gente de todos los demás clientes de esa base; y las acciones por usuario buscaban sólo por
 * id, así que quien administra un cliente podía restablecer la contraseña del administrador de
 * otro pasando su id. Los dos se vieron ejecutándolo, no leyéndolo.
 */

let dir: string;
let db: Database;

const SITE_A = "site_a";
const SITE_B = "site_b";

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "sastre-panel-tenant-"));
  const url = `file:${join(dir, "compartida.db")}`;
  const client = createClient({ url });
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  client.close();

  db = createDb(url);

  // Dos sitios en la misma base: el modelo de transición, y el que puede filtrar.
  await applyBaseline(db, { siteId: SITE_A, siteName: "Cliente A" });
  await applyBaseline(db, { siteId: SITE_B, siteName: "Cliente B" });

  const now = new Date();
  await db.insert(users).values([
    { id: "u_ana", email: "ana@a.test", name: "Ana", createdAt: now, updatedAt: now },
    { id: "u_bea", email: "bea@b.test", name: "Bea", createdAt: now, updatedAt: now },
    { id: "u_dos", email: "dos@ambos.test", name: "Dos", createdAt: now, updatedAt: now },
    { id: "u_nadie", email: "nadie@x.test", name: "Nadie", createdAt: now, updatedAt: now },
  ]);
  await db.insert(userRoles).values([
    { userId: "u_ana", roleId: roleId(SITE_A, "admin"), siteId: SITE_A, assignedAt: now },
    { userId: "u_bea", roleId: roleId(SITE_B, "admin"), siteId: SITE_B, assignedAt: now },
    // Una persona con acceso a los dos: por eso `users` no lleva `siteId`.
    { userId: "u_dos", roleId: roleId(SITE_A, "editor"), siteId: SITE_A, assignedAt: now },
    { userId: "u_dos", roleId: roleId(SITE_B, "editor"), siteId: SITE_B, assignedAt: now },
  ]);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("base compartida", () => {
  it("cada inquilino ve sólo a los suyos", async () => {
    const a = await listTenantPeople(db, SITE_A, false);
    expect(a.map((p) => p.email).sort()).toEqual(["ana@a.test", "dos@ambos.test"]);

    const b = await listTenantPeople(db, SITE_B, false);
    expect(b.map((p) => p.email).sort()).toEqual(["bea@b.test", "dos@ambos.test"]);
  });

  it("y nunca a quien no tiene rol en ninguno", async () => {
    // `nadie@x.test` existe en la base y no administra nada. Con el `leftJoin` original salía
    // en las dos listas.
    const a = await listTenantPeople(db, SITE_A, false);
    expect(a.some((p) => p.email === "nadie@x.test")).toBe(false);
  });

  it("cada uno con el rol que tiene aquí, no con el del otro sitio", async () => {
    const a = await listTenantPeople(db, SITE_A, false);
    const b = await listTenantPeople(db, SITE_B, false);
    expect(a.find((p) => p.email === "dos@ambos.test")?.role).toBe("editor");
    expect(b.find((p) => p.email === "dos@ambos.test")?.role).toBe("editor");
    expect(a.find((p) => p.email === "ana@a.test")?.role).toBe("admin");
  });

  it("una persona de otro sitio no es miembro de éste", async () => {
    // El guarda que faltaba: sin él, pasar el id de Bea a una acción sobre el sitio A
    // restablecía su contraseña.
    expect(await isTenantMember(db, SITE_A, false, "u_bea")).toBe(false);
    expect(await isTenantMember(db, SITE_A, false, "u_ana")).toBe(true);
    expect(await isTenantMember(db, SITE_A, false, "u_dos")).toBe(true);
    expect(await isTenantMember(db, SITE_A, false, "u_nadie")).toBe(false);
  });

  it("un id inventado tampoco", async () => {
    expect(await isTenantMember(db, SITE_A, false, "u_no_existe")).toBe(false);
  });
});

describe("base propia", () => {
  it("salen todos, porque todos son suyos", async () => {
    // Con base propia no hay nadie más dentro, así que el que no tiene rol también sale: es
    // justo el estado que hay que arreglar, y no se arregla si no se ve.
    const todos = await listTenantPeople(db, SITE_A, true);
    expect(todos.map((p) => p.email).sort()).toEqual([
      "ana@a.test",
      "bea@b.test",
      "dos@ambos.test",
      "nadie@x.test",
    ]);
    expect(todos.find((p) => p.email === "nadie@x.test")?.role).toBeNull();
  });

  it("y cualquiera de esa base es miembro", async () => {
    expect(await isTenantMember(db, SITE_A, true, "u_nadie")).toBe(true);
    expect(await isTenantMember(db, SITE_A, true, "u_no_existe")).toBe(false);
  });
});

describe("la contraseña generada", () => {
  it("no lleva caracteres que se confundan al dictarla", () => {
    // Se pega en un mensaje o se dicta por teléfono, y una `l` que parece un `1` convierte un
    // alta en una llamada de soporte.
    const sample = Array.from({ length: 200 }, () => generatePassword()).join("");
    for (const bad of ["l", "I", "1", "0", "O"]) {
      expect(sample.includes(bad), `contiene «${bad}»`).toBe(false);
    }
  });

  it("tiene la longitud pedida y no se repite", () => {
    expect(generatePassword(24)).toHaveLength(24);
    const many = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(many.size).toBe(200);
  });

  it("usa el alfabeto entero, sin cola descartada de más", () => {
    // El rechazo por sesgo de módulo descarta bytes; si estuviera mal, la última parte del
    // alfabeto no saldría nunca.
    const sample = Array.from({ length: 3000 }, () => generatePassword(1)).join("");
    expect(new Set(sample).size).toBe(57);
  });
});
