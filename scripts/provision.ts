#!/usr/bin/env node
import "dotenv/config";
import { eq, isNotNull } from "drizzle-orm";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { createControlDb } from "../src/db/control-client";
import { tenants } from "../src/db/control-schema";
import { createDb } from "../src/db/client";
import { applyBaseline } from "../src/db/baseline";
import { DEFAULT_SITE_ID } from "../src/lib/site";
import { migrateDatabase, inspectDatabase, migrationsAvailable } from "../src/lib/provision/migrate";
import { createDatabase, tursoConfigFromEnv, databaseName } from "../src/lib/provision/turso";

/**
 * Bases de datos por inquilino.
 *
 * El orden importa y es el mismo siempre: crear la base, migrarla, sembrar lo mínimo, y sólo
 * entonces registrarla en el plano de control y activar el inquilino. Al revés —registrar
 * primero— el dominio empieza a resolver contra una base vacía, y el visitante ve el fallo
 * antes que nadie. Por eso `add-tenant` deja el inquilino en `provisioning`: esa es la ventana,
 * y mientras dura sus dominios responden 503.
 *
 *   npx tsx scripts/provision.ts status
 *   npx tsx scripts/provision.ts new <slug> [--local]
 *   npx tsx scripts/provision.ts migrate <slug>
 *   npx tsx scripts/provision.ts migrate-all
 */

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
};

function fail(message: string): never {
  console.error(`${C.red}Error:${C.reset} ${message}`);
  process.exit(1);
}

const controlUrl = process.env.CONTROL_DATABASE_URL;
if (!controlUrl) fail("CONTROL_DATABASE_URL no está puesta. Ver `npm run control`.");
const control = createControlDb(controlUrl, process.env.CONTROL_AUTH_TOKEN);

/** La base compartida, que es donde siguen los inquilinos sin base propia. */
function sharedDatabase(): { url: string; authToken?: string } {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) fail("TURSO_DATABASE_URL no está puesta.");
  const token = process.env.TURSO_AUTH_TOKEN;
  return { url, ...(token ? { authToken: token } : {}) };
}

const [command, ...args] = process.argv.slice(2);

try {
  await run(command, args);
} catch (error) {
  console.error(`\n${C.red}Ha fallado:${C.reset} ${(error as Error).message}`);
  console.error(
    `${C.dim}El inquilino se queda como estaba y sus dominios siguen dando 503.\n` +
      `Corrige lo que sea y vuelve a lanzar el mismo comando: todos los pasos se pueden repetir.${C.reset}`
  );
  process.exit(1);
}

async function run(command: string | undefined, args: string[]) {
switch (command) {
  /* ------------------------------------------------------------------ status */
  case "status": {
    const available = migrationsAvailable();
    const rows = await control.query.tenants.findMany();
    console.log(`${C.dim}${available} migraciones en el repositorio${C.reset}\n`);

    if (!rows.length) {
      console.log(`${C.dim}No hay inquilinos.${C.reset}`);
      break;
    }

    for (const tenant of rows) {
      const own = Boolean(tenant.databaseUrl);
      const target = own
        ? { url: tenant.databaseUrl!, authToken: tenant.databaseAuthToken ?? undefined }
        : sharedDatabase();

      let line: string;
      try {
        const { applied, behind } = await inspectDatabase(target.url, target.authToken);
        line = behind
          ? `${C.red}${applied}/${available} — le faltan ${behind}${C.reset}`
          : `${C.green}${applied}/${available} — al día${C.reset}`;
      } catch (error) {
        // Que no se pueda abrir es un resultado, no una excepción: con treinta inquilinos, uno
        // inalcanzable no puede impedir ver el estado de los otros veintinueve.
        line = `${C.red}no se puede abrir: ${(error as Error).message.slice(0, 60)}${C.reset}`;
      }

      console.log(
        `${C.bold}${tenant.slug}${C.reset}  ${tenant.status}  ` +
          `${C.dim}${own ? "base propia" : "compartida"}${C.reset}\n  ${line}`
      );
    }
    break;
  }

  /* --------------------------------------------------------------------- new */
  case "new": {
    const [slug] = args;
    if (!slug) fail("Uso: new <slug> [--local]");

    const tenant = await control.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
    if (!tenant) fail(`No hay ningún inquilino «${slug}». Créalo antes con \`npm run control -- add-tenant\`.`);
    if (tenant.databaseUrl) fail(`«${slug}» ya tiene base propia: ${tenant.databaseUrl}`);

    // Local o Turso.
    //
    // `--local` existe porque el camino entero —migrar, sembrar, registrar, servir— tiene que
    // poder probarse sin una cuenta de pago y sin crear nada que luego haya que borrar.
    let created: { url: string; authToken?: string };
    if (args.includes("--local")) {
      const path = resolve(`.tenants/${databaseName(slug)}.db`);
      // libsql no crea el directorio, y su error —«Unable to open connection … 14»— no dice
      // que sea eso.
      mkdirSync(dirname(path), { recursive: true });
      created = { url: `file:${path}` };
      console.log(`${C.dim}Base local en ${path}${C.reset}`);
    } else {
      const config = tursoConfigFromEnv();
      if (!config) {
        fail(
          "Faltan TURSO_ORG y TURSO_PLATFORM_TOKEN para crear la base en Turso.\n" +
            "  Para probar el camino completo sin cuenta: `new " + slug + " --local`"
        );
      }
      console.log(`${C.dim}Creando ${databaseName(slug)} en Turso…${C.reset}`);
      created = await createDatabase(config, slug);
    }

    console.log(`${C.dim}Migrando…${C.reset}`);
    const report = await migrateDatabase(created.url, created.authToken);
    console.log(`  ${C.green}✓${C.reset} ${report.after}/${report.available} migraciones`);

    console.log(`${C.dim}Sembrando lo mínimo…${C.reset}`);
    const db = createDb(created.url, created.authToken);
    // Cada inquilino tiene un solo sitio dentro de su base, y siempre el mismo id: dentro de
    // su propia base no hay nada de lo que distinguirlo.
    await applyBaseline(db, { siteId: DEFAULT_SITE_ID, siteName: tenant.name });
    console.log(`  ${C.green}✓${C.reset} sitio, tipos base, roles, permisos y ajustes`);

    // Lo último: hasta aquí, si algo se ha roto, el inquilino sigue apuntando a la base
    // compartida y nadie ha visto nada raro.
    await control
      .update(tenants)
      .set({
        databaseUrl: created.url,
        databaseAuthToken: created.authToken ?? null,
        siteId: DEFAULT_SITE_ID,
      })
      .where(eq(tenants.id, tenant.id));

    console.log(`\n${C.green}✓${C.reset} «${slug}» tiene base propia.`);
    console.log(
      `${C.dim}  Falta: crear su administrador y activarlo —\n` +
        `    npm run control -- status ${slug} active${C.reset}`
    );
    break;
  }

  /* ----------------------------------------------------------------- migrate */
  case "migrate": {
    const [slug] = args;
    if (!slug) fail("Uso: migrate <slug>");
    const tenant = await control.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
    if (!tenant) fail(`No hay ningún inquilino «${slug}».`);
    if (!tenant.databaseUrl) fail(`«${slug}» usa la base compartida: migra ésa con \`npm run db:migrate\`.`);

    const report = await migrateDatabase(tenant.databaseUrl, tenant.databaseAuthToken ?? undefined);
    console.log(
      report.before === report.after
        ? `${C.dim}«${slug}» ya estaba al día (${report.after}/${report.available}).${C.reset}`
        : `${C.green}✓${C.reset} «${slug}»: ${report.before} → ${report.after} de ${report.available}.`
    );
    break;
  }

  /* ------------------------------------------------------------- migrate-all */
  case "migrate-all": {
    /*
     * El paso que se olvida.
     *
     * Con una base, migrar es parte del despliegue. Con treinta, olvidar una significa que el
     * sitio de un cliente empieza a fallar por una columna que no existe mientras los demás van
     * bien — y el despliegue dijo que todo había ido bien.
     *
     * No se para en el primer fallo: uno inalcanzable no puede dejar sin migrar a los que
     * vienen detrás. Se cuentan y se listan al final.
     */
    const rows = await control.query.tenants.findMany({ where: isNotNull(tenants.databaseUrl) });
    if (!rows.length) {
      console.log(`${C.dim}Ningún inquilino tiene base propia todavía.${C.reset}`);
      break;
    }

    const failures: string[] = [];
    let migrated = 0;

    for (const tenant of rows) {
      try {
        const report = await migrateDatabase(tenant.databaseUrl!, tenant.databaseAuthToken ?? undefined);
        if (report.before === report.after) {
          console.log(`  ${C.dim}${tenant.slug}: al día${C.reset}`);
        } else {
          migrated++;
          console.log(`  ${C.green}✓${C.reset} ${tenant.slug}: ${report.before} → ${report.after}`);
        }
      } catch (error) {
        failures.push(`${tenant.slug}: ${(error as Error).message.slice(0, 120)}`);
        console.log(`  ${C.red}✗${C.reset} ${tenant.slug}`);
      }
    }

    console.log(`\n${rows.length} inquilinos, ${migrated} migrados.`);
    if (failures.length) {
      console.log(`${C.red}${failures.length} fallaron:${C.reset}`);
      for (const failure of failures) console.log(`  ${failure}`);
      process.exitCode = 1;
    }
    break;
  }

  default:
    console.log(
      `${C.bold}Bases de datos por inquilino${C.reset}\n\n` +
        `  status              qué inquilino está a cuántas migraciones\n` +
        `  new <slug> [--local]  crea su base, la migra, la siembra y la registra\n` +
        `  migrate <slug>      pone al día una\n` +
        `  migrate-all         pone al día todas. Lánzalo en cada despliegue.\n`
    );
    if (command) process.exitCode = 1;
}
}
