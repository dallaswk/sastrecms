import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { applyBaseline } from "./baseline";

import { DEFAULT_SITE_ID as SITE_ID } from "../lib/site";

/**
 * Siembra la base de desarrollo.
 *
 * Carga `.env` por su cuenta: se lanza con `tsx`, que no lo hace, y el mensaje que salía sin
 * ello —«TURSO_DATABASE_URL is required»— parecía un problema de configuración cuando el
 * fichero estaba ahí al lado.
 *
 * Lo que escribe vive en `baseline.ts`, compartido con el aprovisionamiento: tener aquí una
 * segunda copia de los tipos base y los roles significaba que un inquilino nuevo y este script
 * podían acabar creando cosas distintas, y que la diferencia sólo se vería al usarlo.
 */
async function seed() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) throw new Error("TURSO_DATABASE_URL is required");

  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema });

  console.log("🌱 Seeding database...");
  await applyBaseline(db, { siteId: SITE_ID, siteName: "My Site" });
  console.log("  ✓ site, system content types, roles, admin permissions, settings");
  console.log("\n✅ Seed complete.");
}

seed().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});
