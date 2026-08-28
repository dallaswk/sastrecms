/**
 * Crear bases de datos en Turso, desde su API de plataforma.
 *
 * Separado del script que lo usa para que se pueda leer, y porque el día que haya que sustituir
 * Turso por otra cosa esto es lo único que cambia.
 *
 * ⚠️ Este fichero no está probado contra la API de verdad: hace falta un token de organización
 * que no tengo. Lo que sí está probado de punta a punta es todo lo demás —migrar, sembrar,
 * registrar, servir— usando el proveedor de fichero local. Antes de usar esto en producción,
 * lánzalo una vez contra un inquilino de prueba y bórralo.
 */

const API = "https://api.turso.tech/v1";

export type TursoConfig = {
  organisation: string;
  /** Token de plataforma, no de base de datos. Se saca con `turso auth api-tokens create`. */
  token: string;
  /** El grupo donde nacen las bases. Turso las quiere todas en uno. */
  group: string;
};

export type CreatedDatabase = { url: string; authToken: string };

export function tursoConfigFromEnv(env = process.env): TursoConfig | null {
  const organisation = env.TURSO_ORG;
  const token = env.TURSO_PLATFORM_TOKEN;
  if (!organisation || !token) return null;
  return { organisation, token, group: env.TURSO_GROUP ?? "default" };
}

async function call<T>(config: TursoConfig, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}/organizations/${config.organisation}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    // El cuerpo del error de Turso dice qué ha pasado —nombre repetido, cuota, grupo
    // inexistente— y perderlo dejaría sólo un número.
    const detail = await response.text().catch(() => "");
    throw new Error(`Turso ${response.status} en ${path}: ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

/** El nombre en Turso: minúsculas, guiones, y prefijo para no mezclarlo con otras cosas. */
export function databaseName(slug: string): string {
  return `sastre-${slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")}`.slice(0, 58);
}

export async function createDatabase(
  config: TursoConfig,
  slug: string
): Promise<CreatedDatabase> {
  const name = databaseName(slug);

  const created = await call<{ database: { Hostname: string } }>(config, "/databases", {
    name,
    group: config.group,
  });

  const { jwt } = await call<{ jwt: string }>(
    config,
    `/databases/${name}/auth/tokens`,
    // Sin caducidad: es la credencial con la que el Worker sirve el sitio, y una que expira
    // apaga el sitio de un cliente a una hora que nadie eligió. Revocarla es cosa de dar de
    // baja al inquilino.
    {}
  );

  return { url: `libsql://${created.database.Hostname}`, authToken: jwt };
}
