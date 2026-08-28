import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createControlDb, type ControlDatabase } from "@db/control-client";
import { operators, operatorTenants, tenants } from "@db/control-schema";
import {
  findOperator,
  visibleTenantIds,
  canManage,
  canCreateTenants,
  tenantSlug,
  listTenantsFor,
  tenantForOperator,
} from "./panel";

/**
 * Quién ve qué en el panel.
 *
 * Contra un plano de control de verdad —fichero temporal, migraciones reales— porque lo que se
 * comprueba aquí es una decisión de permisos, y un doble que devuelva lo que le pidas comprueba
 * el doble. Es lo mismo que se hizo con el aprovisionamiento y cuesta milisegundos.
 */

let dir: string;
let control: ControlDatabase;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "sastre-panel-"));
  const url = `file:${join(dir, "control.db")}`;
  const client = createClient({ url });
  await migrate(drizzle(client), { migrationsFolder: "drizzle/control" });
  client.close();
  control = createControlDb(url);

  await control.insert(tenants).values([
    { id: "t_uno", slug: "uno", name: "Uno", siteId: "site_default", status: "active" },
    { id: "t_dos", slug: "dos", name: "Dos", siteId: "site_default", status: "provisioning" },
  ]);
  await control.insert(operators).values([
    { id: "op_super", email: "super@test.local", name: "Super", isSuperAdmin: true },
    { id: "op_uno", email: "uno@test.local", name: "Sólo uno", isSuperAdmin: false },
    { id: "op_baja", email: "baja@test.local", name: "De baja", isSuperAdmin: true, disabled: true },
  ]);
  await control.insert(operatorTenants).values({ operatorId: "op_uno", tenantId: "t_uno" });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("quién es operador", () => {
  it("encuentra al que existe", async () => {
    const operator = await findOperator(control, "uno@test.local");
    expect(operator?.id).toBe("op_uno");
  });

  it("no le importan las mayúsculas ni los espacios del correo", async () => {
    expect(await findOperator(control, "  Uno@Test.Local ")).not.toBeNull();
  });

  it("una cuenta desactivada es como no tenerla", async () => {
    // No basta con quitarle los inquilinos: un super admin no los tiene listados, así que
    // desactivarlo tiene que cortar aquí o seguiría viéndolo todo.
    expect(await findOperator(control, "baja@test.local")).toBeNull();
  });

  it("una cuenta que no está no entra", async () => {
    expect(await findOperator(control, "cualquiera@test.local")).toBeNull();
  });
});

describe("qué ve cada uno", () => {
  it("el super admin, todo, sin necesitar filas", async () => {
    const operator = (await findOperator(control, "super@test.local"))!;
    expect(await visibleTenantIds(control, operator)).toBeNull();
    expect((await listTenantsFor(control, operator)).map((t) => t.slug).sort()).toEqual(["dos", "uno"]);
  });

  it("los demás, sólo los suyos", async () => {
    const operator = (await findOperator(control, "uno@test.local"))!;
    expect(await visibleTenantIds(control, operator)).toEqual(["t_uno"]);
    expect((await listTenantsFor(control, operator)).map((t) => t.slug)).toEqual(["uno"]);
  });

  it("pedir uno ajeno por slug devuelve «no existe», no «no puedes»", async () => {
    // Lo segundo confirmaría que hay un inquilino con ese slug, que es justo lo que no debe
    // saber quien no lo administra.
    const operator = (await findOperator(control, "uno@test.local"))!;
    expect(await tenantForOperator(control, operator, "dos")).toBeNull();
    expect(await tenantForOperator(control, operator, "uno")).not.toBeNull();
  });

  it("canManage responde igual que la lista", async () => {
    const propio = (await findOperator(control, "uno@test.local"))!;
    const todo = (await findOperator(control, "super@test.local"))!;
    expect(await canManage(control, propio, "t_uno")).toBe(true);
    expect(await canManage(control, propio, "t_dos")).toBe(false);
    expect(await canManage(control, todo, "t_dos")).toBe(true);
  });
});

describe("quién puede crear inquilinos", () => {
  it("sólo el super admin", async () => {
    // Administrar el sitio de un cliente y dar de alta clientes nuevos son cosas distintas, y
    // la segunda cuesta una base de datos.
    expect(canCreateTenants((await findOperator(control, "super@test.local"))!)).toBe(true);
    expect(canCreateTenants((await findOperator(control, "uno@test.local"))!)).toBe(false);
  });
});

describe("el slug del inquilino", () => {
  it("quita acentos y eñes, que Turso no acepta en el nombre de la base", () => {
    expect(tenantSlug("Clínica Álvarez")).toBe("clinica-alvarez");
    expect(tenantSlug("Panadería Ñam")).toBe("panaderia-nam");
  });

  it("no acaba en guion aunque el recorte caiga ahí", () => {
    const long = tenantSlug("a".repeat(39) + " sol");
    expect(long.endsWith("-")).toBe(false);
    expect(long.length).toBeLessThanOrEqual(40);
  });

  it("de un nombre sin letras no sale slug, y el llamante tiene que notarlo", () => {
    expect(tenantSlug("!!!")).toBe("");
  });
});
