import { eq } from "drizzle-orm";
import { domains, tenants, type TenantStatus } from "@db/control-schema";
import type { ControlDatabase } from "@db/control-client";
import { DEFAULT_SITE_ID, normaliseHost } from "@lib/site";

/**
 * De un dominio a un inquilino.
 *
 * Esto corre en **todas** las peticiones públicas y antes de cualquier otra cosa: hasta que no
 * se resuelve, no se sabe ni a qué base de datos conectarse. Así que las tres propiedades que
 * importan son que sea rápido, que no se pueda envenenar, y que un despliegue sin plano de
 * control siga funcionando exactamente igual que hoy.
 */

export type ResolvedTenant = {
  /** Nulo cuando no hay plano de control, o cuando nadie reclama el dominio. */
  tenantId: string | null;
  /** El id del sitio dentro de su base. Lo que hoy es `locals.siteId`. */
  siteId: string;
  status: TenantStatus;
  /** Nulo = la base compartida de siempre. Con valor = la suya (paso 5). */
  database: { url: string; authToken?: string } | null;
};

/**
 * Lo que se sirve cuando no hay plano de control configurado.
 *
 * Un despliegue mono-inquilino no tiene por qué registrar su dominio en ningún sitio, y
 * exigírselo significaría que desplegar en un dominio nuevo no sirve nada hasta que alguien
 * toque una tabla. Ésta es la razón de que todo lo de aquí sea aditivo.
 */
export const STANDALONE: ResolvedTenant = {
  tenantId: null,
  siteId: DEFAULT_SITE_ID,
  status: "active",
  database: null,
};

type Entry = { value: ResolvedTenant; expires: number };

const cache = new Map<string, Entry>();

/**
 * Cuánto se recuerda una resolución.
 *
 * La versión mono-inquilino cacheaba para toda la vida del isolate y lo daba por bueno, porque
 * cambiar el dominio era editar una fila a mano. Con panel deja de serlo: apuntar un dominio es
 * algo que alguien hace y espera ver funcionar, y «espera a que Cloudflare recicle el isolate»
 * no es una respuesta. Un minuto cuesta un viaje por dominio, por isolate y por minuto, que
 * frente a lo que cuesta servir la página es nada.
 */
const TTL_MS = 60_000;

/**
 * Tope del mapa.
 *
 * Los aciertos son pocos —tantos como dominios haya— pero los fallos los elige quien llama:
 * basta con mandar peticiones con cabeceras `Host` inventadas para que un isolate caliente vaya
 * guardando una entrada por cada una. Se vacía entero al llegar al tope en vez de expulsar el
 * más viejo: mantener orden de uso cuesta más que el problema que resuelve, y lo peor que pasa
 * al vaciar es que los dominios de verdad pagan un viaje.
 */
const MAX_ENTRIES = 512;

function remember(host: string, value: ResolvedTenant): ResolvedTenant {
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(host, { value, expires: Date.now() + TTL_MS });
  return value;
}

/**
 * Qué inquilino atiende este host.
 *
 * Recibe una fábrica, no una conexión: ver la nota de dentro.
 *
 * Sin plano de control devuelve `STANDALONE`, que es el comportamiento de siempre. Con plano de
 * control, un dominio que nadie reclama **también** devuelve `STANDALONE`: en una instalación
 * mono-inquilino que acaba de estrenar plano de control eso es lo correcto, y en una de verdad
 * multi-inquilino el dominio no debería estar llegando al Worker.
 */
export async function resolveTenant(
  connect: (() => ControlDatabase) | null,
  host: string
): Promise<ResolvedTenant> {
  if (!connect) return STANDALONE;

  const key = normaliseHost(host);
  if (!key) return STANDALONE;

  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  // La conexión se abre aquí y no antes: con la caché caliente, que es el caso normal, esta
  // función no toca la red. Recibir la base ya construida costaría un cliente libSQL por
  // petición y por isolate para no usarlo.
  const row = await connect()
    .select({
      id: tenants.id,
      siteId: tenants.siteId,
      status: tenants.status,
      databaseUrl: tenants.databaseUrl,
      databaseAuthToken: tenants.databaseAuthToken,
    })
    .from(domains)
    .innerJoin(tenants, eq(tenants.id, domains.tenantId))
    .where(eq(domains.host, key))
    .limit(1);

  const found = row[0];
  if (!found) return remember(key, STANDALONE);

  return remember(key, {
    tenantId: found.id,
    siteId: found.siteId,
    status: found.status,
    database: found.databaseUrl
      ? {
          url: found.databaseUrl,
          ...(found.databaseAuthToken ? { authToken: found.databaseAuthToken } : {}),
        }
      : null,
  });
}

/**
 * Olvida un host, para que un cambio se vea sin esperar al TTL.
 *
 * Sólo afecta al isolate que la llama, que es la mitad del trabajo: el panel la usará al mapear
 * un dominio para que quien lo acaba de configurar lo vea al instante, y el resto de isolates se
 * enteran por el TTL. Prometer más que eso sería mentir — invalidar en todos haría falta un
 * canal entre isolates que no existe.
 */
export function forgetTenant(host: string): void {
  cache.delete(normaliseHost(host));
}

/** Vacía la caché entera. Para los tests, y para cuando cambia algo global. */
export function forgetAllTenants(): void {
  cache.clear();
}

/** Un inquilino suspendido o a medio crear no sirve páginas. */
export function isServable(tenant: ResolvedTenant): boolean {
  return tenant.status === "active";
}
