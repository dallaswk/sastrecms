#!/usr/bin/env node
import { eq } from "drizzle-orm";
import { createControlDb } from "../src/db/control-client";
import { tenants, domains, operators, operatorTenants } from "../src/db/control-schema";
import { normaliseHost } from "../src/lib/site";

/**
 * El plano de control desde la terminal.
 *
 * El panel es un paso posterior, y hasta que exista esto es lo único que puede dar de alta un
 * inquilino. No es un apaño mientras tanto: unas tablas que sólo sabe rellenar una interfaz que
 * todavía no existe son tablas decorativas, y el panel se construirá encima de estas mismas
 * operaciones en vez de inventarlas otra vez.
 *
 *   npx tsx scripts/control.ts tenants
 *   npx tsx scripts/control.ts add-tenant <slug> <nombre> [siteId]
 *   npx tsx scripts/control.ts map <slug> <dominio> [--primary]
 *   npx tsx scripts/control.ts unmap <dominio>
 *   npx tsx scripts/control.ts status <slug> <provisioning|active|suspended> [motivo]
 *   npx tsx scripts/control.ts add-operator <email> [nombre] [--super]
 *   npx tsx scripts/control.ts grant <email> <slug> [owner|manager]
 */

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};

function fail(message: string): never {
  console.error(`${C.red}Error:${C.reset} ${message}`);
  process.exit(1);
}

/** Ids legibles, como el resto del proyecto: se leen en logs y en mensajes de error. */
function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

const url = process.env.CONTROL_DATABASE_URL;
if (!url) {
  fail(
    "CONTROL_DATABASE_URL no está puesta.\n" +
      "  El plano de control vive en otra base de datos: créala, aplícale las migraciones con\n" +
      "  `npm run db:control:migrate`, y pon su URL en el entorno."
  );
}
const db = createControlDb(url, process.env.CONTROL_AUTH_TOKEN);

async function bySlug(slug: string) {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
  if (!tenant) fail(`No hay ningún inquilino con el slug «${slug}».`);
  return tenant;
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "tenants": {
    const rows = await db.query.tenants.findMany({ with: { domains: true } });
    if (!rows.length) {
      console.log(`${C.dim}No hay ningún inquilino todavía.${C.reset}`);
      break;
    }
    for (const tenant of rows) {
      const colour = tenant.status === "active" ? C.green : C.yellow;
      const hosts = tenant.domains.map((d) => (d.isPrimary ? `${C.bold}${d.host}${C.reset}` : d.host));
      console.log(
        `${C.bold}${tenant.slug}${C.reset}  ${colour}${tenant.status}${C.reset}  ` +
          `${C.dim}site=${tenant.siteId}${tenant.databaseUrl ? " db=propia" : " db=compartida"}${C.reset}\n` +
          `  ${tenant.name}\n` +
          `  ${hosts.length ? hosts.join(", ") : `${C.dim}sin dominios${C.reset}`}`
      );
    }
    break;
  }

  case "add-tenant": {
    const [slug, name, siteId] = args;
    if (!slug || !name) fail("Uso: add-tenant <slug> <nombre> [siteId]");

    const existing = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
    if (existing) fail(`Ya hay un inquilino con el slug «${slug}».`);

    const tenantId = id("t");
    await db.insert(tenants).values({
      id: tenantId,
      slug,
      name,
      // Nace en `provisioning` a propósito: hasta que tenga base y dominio no debe servir, y
      // el orden natural —crear, migrar, mapear, activar— es el que evita que un visitante
      // llegue a un sitio a medio montar.
      status: "provisioning",
      siteId: siteId ?? "site_default",
    });

    console.log(`${C.green}✓${C.reset} Inquilino ${C.bold}${slug}${C.reset} creado (${tenantId}).`);
    console.log(`${C.dim}  Sigue: map ${slug} <dominio>, y luego status ${slug} active${C.reset}`);
    break;
  }

  case "map": {
    const [slug, host] = args;
    if (!slug || !host) fail("Uso: map <slug> <dominio> [--primary]");
    const tenant = await bySlug(slug);
    const key = normaliseHost(host);

    const taken = await db.query.domains.findFirst({ where: eq(domains.host, key) });
    if (taken && taken.tenantId !== tenant.id) {
      // Dos inquilinos reclamando un dominio no es un conflicto que una petición pueda
      // resolver, así que se para aquí y no en la resolución.
      const other = await db.query.tenants.findFirst({ where: eq(tenants.id, taken.tenantId) });
      fail(`«${key}» ya es de «${other?.slug ?? taken.tenantId}».`);
    }

    const primary = args.includes("--primary");
    if (primary) {
      await db.update(domains).set({ isPrimary: false }).where(eq(domains.tenantId, tenant.id));
    }
    await db
      .insert(domains)
      .values({ host: key, tenantId: tenant.id, isPrimary: primary })
      .onConflictDoUpdate({ target: domains.host, set: { isPrimary: primary } });

    console.log(`${C.green}✓${C.reset} ${key} → ${C.bold}${slug}${C.reset}${primary ? " (principal)" : ""}`);
    console.log(`${C.dim}  Tarda hasta un minuto en verse: la resolución se cachea por isolate.${C.reset}`);
    break;
  }

  case "unmap": {
    const [host] = args;
    if (!host) fail("Uso: unmap <dominio>");
    const key = normaliseHost(host);
    const row = await db.query.domains.findFirst({ where: eq(domains.host, key) });
    if (!row) fail(`«${key}» no está mapeado.`);
    await db.delete(domains).where(eq(domains.host, key));
    console.log(`${C.green}✓${C.reset} ${key} desmapeado. Volverá a servirse como mono-inquilino.`);
    break;
  }

  case "status": {
    const [slug, status, ...reason] = args;
    if (!slug || !status) fail("Uso: status <slug> <provisioning|active|suspended> [motivo]");
    if (!["provisioning", "active", "suspended"].includes(status)) {
      fail(`Estado desconocido: «${status}».`);
    }
    const tenant = await bySlug(slug);
    await db
      .update(tenants)
      .set({
        status: status as "provisioning" | "active" | "suspended",
        suspendedAt: status === "suspended" ? new Date() : null,
        suspendedReason: status === "suspended" ? reason.join(" ") || null : null,
      })
      .where(eq(tenants.id, tenant.id));
    console.log(`${C.green}✓${C.reset} ${slug} → ${status}`);
    if (status !== "active") {
      console.log(`${C.dim}  Sus dominios responden 503 hasta que vuelva a estar activo.${C.reset}`);
    }
    break;
  }

  case "add-operator": {
    const [email, ...rest] = args;
    if (!email) fail("Uso: add-operator <email> [nombre] [--super]");
    const isSuper = rest.includes("--super");
    const name = rest.filter((r) => r !== "--super").join(" ") || null;

    const existing = await db.query.operators.findFirst({ where: eq(operators.email, email) });
    if (existing) fail(`Ya existe un operador con ${email}.`);

    await db.insert(operators).values({ id: id("op"), email, name, isSuperAdmin: isSuper });
    console.log(`${C.green}✓${C.reset} Operador ${email}${isSuper ? " (super)" : ""}.`);
    break;
  }

  case "grant": {
    const [email, slug, role] = args;
    if (!email || !slug) fail("Uso: grant <email> <slug> [owner|manager]");
    const operator = await db.query.operators.findFirst({ where: eq(operators.email, email) });
    if (!operator) fail(`No hay ningún operador con ${email}.`);
    const tenant = await bySlug(slug);

    await db
      .insert(operatorTenants)
      .values({
        operatorId: operator.id,
        tenantId: tenant.id,
        role: (role as "owner" | "manager") ?? "manager",
      })
      .onConflictDoUpdate({
        target: [operatorTenants.operatorId, operatorTenants.tenantId],
        set: { role: (role as "owner" | "manager") ?? "manager" },
      });

    console.log(`${C.green}✓${C.reset} ${email} administra ${C.bold}${slug}${C.reset}.`);
    break;
  }

  default:
    console.log(
      `${C.bold}El plano de control${C.reset}\n\n` +
        `  tenants                                    lista los inquilinos\n` +
        `  add-tenant <slug> <nombre> [siteId]        crea uno, en provisioning\n` +
        `  map <slug> <dominio> [--primary]           le asigna un dominio\n` +
        `  unmap <dominio>\n` +
        `  status <slug> <estado> [motivo]            provisioning | active | suspended\n` +
        `  add-operator <email> [nombre] [--super]    quien podrá usar el panel\n` +
        `  grant <email> <slug> [owner|manager]\n`
    );
    if (command) process.exitCode = 1;
}
