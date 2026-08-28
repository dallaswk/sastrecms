/**
 * Dónde se guardan los archivos subidos.
 *
 * En producción, R2. En `astro dev` no hay binding de R2 —el adaptador de Node no tiene
 * bindings de Cloudflare— así que subir un archivo respondía «R2 bucket not configured» con un
 * 500 y sin más explicación. El efecto práctico es que **no se podía montar un sitio en local**:
 * lo primero que pide cualquier sitio es su logo.
 *
 * Así que en desarrollo se escribe en `public/uploads/`, que el servidor de Astro ya sirve como
 * estático, y la URL queda relativa al propio origen. No es un sustituto de R2 ni pretende
 * serlo: es lo que permite trabajar sin una cuenta de Cloudflare delante.
 */

export type MediaStore = {
  /** Cuál es. Se enseña en la interfaz, porque «guardado en local» y «guardado en R2» no son lo mismo. */
  kind: "r2" | "local";
  put(key: string, bytes: ArrayBuffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** La URL pública del archivo. Absoluta con R2, relativa en local. */
  urlFor(key: string): string;
};

/** Lo mínimo que se usa del binding, para no arrastrar los tipos de Workers hasta aquí. */
type Bucket = {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

export function r2Store(bucket: Bucket, publicBase: string): MediaStore {
  const base = publicBase.replace(/\/+$/, "");
  return {
    kind: "r2",
    put: async (key, bytes, contentType) => {
      await bucket.put(key, bytes, { httpMetadata: { contentType } });
    },
    remove: async (key) => {
      await bucket.delete(key);
    },
    urlFor: (key) => `${base}/${key}`,
  };
}

/** Dónde caen los archivos en desarrollo. Servido por Astro como cualquier otro estático. */
export const LOCAL_DIR = "public/uploads";
export const LOCAL_PREFIX = "/uploads";

/**
 * Si esto es un Worker.
 *
 * Hace falta preguntarlo explícitamente porque «¿se puede importar `node:fs`?» **no** sirve de
 * detección: con `nodejs_compat` el bundler mete un polirrelleno, el import tiene éxito, y sus
 * funciones fallan al llamarlas. Una detección así daría, en un despliegue de Workers sin R2
 * configurado, un almacén que parece bueno y revienta al escribir el primer archivo — en vez
 * del mensaje que dice qué variable falta.
 *
 * `navigator.userAgent` lo declara el propio runtime y es la señal que Cloudflare documenta.
 */
function onWorkers(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.userAgent === "string" &&
    navigator.userAgent.includes("Cloudflare-Workers")
  );
}

/**
 * El almacén de desarrollo, sobre el sistema de ficheros.
 *
 * Nunca en Workers: ahí no hay disco que persista, y guardar el logo de un cliente en uno
 * efímero es peor que negarse, porque el fallo aparece días después y sin causa visible.
 */
export async function localStore(): Promise<MediaStore | null> {
  if (onWorkers()) return null;

  let fs: typeof import("node:fs/promises");
  let path: typeof import("node:path");
  try {
    fs = await import("node:fs/promises");
    path = await import("node:path");
  } catch {
    return null;
  }

  return {
    kind: "local",
    put: async (key, bytes) => {
      const target = path.join(LOCAL_DIR, key);
      // La clave lleva el sitio dentro (`{siteId}/{id}.{ext}`), así que hay un directorio por
      // crear en cada subida nueva.
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, Buffer.from(bytes));
    },
    remove: async (key) => {
      // Que no exista no es un error: borrar dos veces la misma fila no debe fallar la segunda.
      await fs.rm(path.join(LOCAL_DIR, key), { force: true });
    },
    urlFor: (key) => `${LOCAL_PREFIX}/${key}`,
  };
}

/**
 * El almacén que corresponde a este entorno.
 *
 * R2 manda siempre que haya binding. Sin él se cae al de desarrollo, y sólo si no hay ninguno
 * se devuelve `null` — que el llamante convierte en un mensaje que dice qué falta, en vez de en
 * un 500 pelado.
 *
 * Con R2 pero sin `R2_PUBLIC_URL` **no** se cae al local: eso es un despliegue mal configurado,
 * y guardar los archivos en un disco efímero disimularía el fallo hasta que alguien mirase por
 * qué las imágenes del cliente desaparecen entre despliegues.
 */
export async function resolveMediaStore(env: {
  R2_BUCKET?: unknown;
  R2_PUBLIC_URL?: string;
}): Promise<{ store: MediaStore } | { store: null; reason: string }> {
  if (env.R2_BUCKET) {
    if (!env.R2_PUBLIC_URL) {
      return {
        store: null,
        reason:
          "Hay bucket de R2 pero falta R2_PUBLIC_URL. Sin ella los archivos se guardarían con " +
          "una URL inválida, así que la subida se para aquí.",
      };
    }
    return { store: r2Store(env.R2_BUCKET as Bucket, env.R2_PUBLIC_URL) };
  }

  const local = await localStore();
  if (local) return { store: local };

  return {
    store: null,
    reason:
      "No hay dónde guardar el archivo: ni bucket de R2 ni sistema de ficheros. " +
      "Configura R2_BUCKET y R2_PUBLIC_URL en el entorno del despliegue.",
  };
}
