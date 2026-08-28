import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

/**
 * Poner al día la base de un inquilino.
 *
 * Sólo Node: lee la carpeta `drizzle/` del disco, así que no corre dentro del Worker. Es una
 * limitación real y conviene decirla en vez de descubrirla: aprovisionar y migrar se lanzan
 * desde una terminal o desde un despliegue, no desde el panel.
 *
 * Lo que de verdad importa aquí no es crear una base nueva —eso se hace una vez— sino que las
 * que ya existen no se queden atrás. Con una sola base, migrar es un paso del despliegue. Con
 * treinta, olvidarse de una significa que el sitio de un cliente empieza a dar errores de
 * columna inexistente mientras los otros veintinueve van bien, y nada en el despliegue lo dijo.
 */

export const MIGRATIONS_FOLDER = "drizzle";

/** Cuántas migraciones existen en el repositorio. La referencia contra la que se compara. */
export function migrationsAvailable(folder = MIGRATIONS_FOLDER): number {
  const journal = join(folder, "meta", "_journal.json");
  if (!existsSync(journal)) throw new Error(`No encuentro ${journal}`);
  const parsed = JSON.parse(readFileSync(journal, "utf8")) as { entries: unknown[] };
  return parsed.entries.length;
}

/**
 * Que la base responda.
 *
 * Se comprueba aparte porque sin esto una base inalcanzable y una recién creada dan el mismo
 * resultado: cero migraciones. El informe entonces dice «le faltan 12» de un inquilino que en
 * realidad está caído, que es a la vez esconder una avería y proponer migrar algo que no
 * existe.
 */
export async function assertReachable(client: Client): Promise<void> {
  try {
    await client.execute("select 1");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`no responde (${detail.split("\n")[0]!.slice(0, 120)})`);
  }
}

/**
 * Cuántas migraciones tiene aplicadas.
 *
 * Cero cuando la tabla no existe, que es el estado de una base recién creada. Sólo tiene
 * sentido después de `assertReachable`: sin eso, este cero también significaría «no llego».
 */
export async function migrationsApplied(client: Client): Promise<number> {
  try {
    const result = await client.execute("select count(*) as n from __drizzle_migrations");
    return Number(result.rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

export type MigrationReport = {
  before: number;
  after: number;
  available: number;
};

/** Aplica lo que falte. Sin nada pendiente no toca la base. */
export async function migrateDatabase(
  url: string,
  authToken?: string,
  folder = MIGRATIONS_FOLDER
): Promise<MigrationReport> {
  const available = migrationsAvailable(folder);
  const client = createClient({ url, ...(authToken ? { authToken } : {}) });

  try {
    await assertReachable(client);
    const before = await migrationsApplied(client);
    if (before < available) {
      await migrate(drizzle(client), { migrationsFolder: folder });
    }
    return { before, after: await migrationsApplied(client), available };
  } finally {
    client.close();
  }
}

/** Sólo mira, no toca. Para saber qué inquilinos están atrasados antes de decidir nada. */
export async function inspectDatabase(
  url: string,
  authToken?: string,
  folder = MIGRATIONS_FOLDER
): Promise<{ applied: number; available: number; behind: number }> {
  const available = migrationsAvailable(folder);
  const client = createClient({ url, ...(authToken ? { authToken } : {}) });
  try {
    await assertReachable(client);
    const applied = await migrationsApplied(client);
    return { applied, available, behind: Math.max(0, available - applied) };
  } finally {
    client.close();
  }
}
