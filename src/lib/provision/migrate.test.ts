import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import {
  migrationsAvailable,
  migrationsApplied,
  assertReachable,
  migrateDatabase,
  inspectDatabase,
} from "./migrate";
import { createDb } from "@db/client";
import { applyBaseline } from "@db/baseline";
import { DEFAULT_SITE_ID } from "@lib/site";

/**
 * Aprovisionar contra bases de verdad, no contra dobles.
 *
 * Son ficheros temporales de SQLite, así que cuestan milisegundos y ejercitan el mismo camino
 * que un inquilino real: las migraciones que hay en el repositorio, aplicadas por el mismo
 * ejecutor. Un doble aquí probaría el doble.
 */

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sastre-provision-"));
  path = `file:${join(dir, "t.db")}`;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("el ejecutor de migraciones", () => {
  it("cuenta las que hay en el repositorio", () => {
    // Contra el journal de verdad: si alguien añade una migración y esto no lo ve, el informe
    // diría «al día» de una base que no lo está.
    expect(migrationsAvailable()).toBeGreaterThanOrEqual(12);
  });

  it("una base recién creada está a cero", async () => {
    const client = createClient({ url: path });
    await client.execute("select 1");
    expect(await migrationsApplied(client)).toBe(0);
    client.close();
  });

  it("las aplica todas y deja la base utilizable", async () => {
    const report = await migrateDatabase(path);
    expect(report.before).toBe(0);
    expect(report.after).toBe(report.available);

    // No basta con que la tabla de migraciones tenga filas: lo que importa es que el esquema
    // esté ahí.
    const client = createClient({ url: path });
    const tables = await client.execute(
      "select name from sqlite_master where type='table' order by name"
    );
    const names = tables.rows.map((r) => String(r.name));
    expect(names).toContain("nodes");
    expect(names).toContain("content_types");
    expect(names).toContain("api_tokens");
    client.close();
  });

  it("volver a migrar no hace nada", async () => {
    await migrateDatabase(path);
    const second = await migrateDatabase(path);
    // Aprovisionar puede cortarse por la mitad; si repetir no fuera seguro, recuperarse sería
    // borrar y empezar de cero.
    expect(second.before).toBe(second.after);
    expect(second.after).toBe(second.available);
  });

  it("distingue una base caída de una vacía", async () => {
    // Las dos daban cero, así que el informe decía «le faltan 12» de un inquilino caído: a la
    // vez esconde la avería y propone migrar algo que no existe.
    await expect(inspectDatabase("libsql://no-existe-jamas.invalid", "x")).rejects.toThrow(
      /no responde/
    );
  });

  it("assertReachable pasa sobre una base que responde", async () => {
    const client = createClient({ url: path });
    await expect(assertReachable(client)).resolves.toBeUndefined();
    client.close();
  });
});

describe("la base mínima", () => {
  it("deja la base lista para entrar al backoffice", async () => {
    await migrateDatabase(path);
    const db = createDb(path);
    await applyBaseline(db, { siteId: DEFAULT_SITE_ID, siteName: "Panadería Sol" });

    const site = await db.query.sites.findFirst();
    expect(site?.name).toBe("Panadería Sol");

    const types = await db.query.contentTypes.findMany();
    expect(types.map((t) => t.key).sort()).toEqual(["page", "portfolio_item", "post"]);

    // Todos los renderers pintan `fields.body`; un tipo base sin él da una página en blanco.
    for (const type of types) {
      expect(type.fieldSchema.some((f) => f.key === "body")).toBe(true);
    }

    const roles = await db.query.roles.findMany();
    expect(roles.map((r) => r.key).sort()).toEqual(["admin", "collaborator", "editor"]);
    // Los ids llevan el sitio dentro: el fallo que dejaba al segundo sitio sin ningún rol.
    expect(roles.every((r) => r.id.endsWith(DEFAULT_SITE_ID))).toBe(true);
  });

  it("se puede volver a aplicar sin duplicar nada", async () => {
    await migrateDatabase(path);
    const db = createDb(path);
    await applyBaseline(db, { siteId: DEFAULT_SITE_ID, siteName: "Panadería Sol" });
    await applyBaseline(db, { siteId: DEFAULT_SITE_ID, siteName: "Panadería Sol" });

    expect((await db.query.sites.findMany()).length).toBe(1);
    expect((await db.query.contentTypes.findMany()).length).toBe(3);
    expect((await db.query.roles.findMany()).length).toBe(3);
    // El comodín se comprueba por contenido y no por id, porque la tabla no tiene índice único
    // sobre (rol, tipo) y el id de esta fila cambió: fiarse del id metería un segundo comodín.
    expect((await db.query.roleContentPermissions.findMany()).length).toBe(1);
    expect((await db.query.settings.findMany()).length).toBe(1);
  });
});
