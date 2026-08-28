import { defineConfig } from "drizzle-kit";

/**
 * Migraciones del plano de control, en su propia carpeta.
 *
 * Config aparte y no un segundo `schema` en la de siempre: son dos bases distintas, y una sola
 * carpeta de migraciones acabaría intentando crear `tenants` dentro de la base de un cliente.
 *
 *   npx drizzle-kit generate --config drizzle.control.config.ts
 *   npx drizzle-kit migrate  --config drizzle.control.config.ts
 */
export default defineConfig({
  schema: "./src/db/control-schema.ts",
  out: "./drizzle/control",
  dialect: "turso",
  dbCredentials: {
    url: process.env.CONTROL_DATABASE_URL!,
    authToken: process.env.CONTROL_AUTH_TOKEN,
  },
});
