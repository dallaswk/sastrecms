import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./control-schema";

/**
 * Cliente del plano de control.
 *
 * Igual que `createDb` y separado a propósito: los tipos de una base no deben poder colarse en
 * la otra. Que `ControlDatabase` y `Database` sean incompatibles es lo que hace que pasar la
 * base equivocada a una consulta no compile en vez de fallar en producción.
 */
export function createControlDb(url: string, authToken?: string) {
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

export type ControlDatabase = ReturnType<typeof createControlDb>;
