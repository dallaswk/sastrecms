import { eq, and } from "drizzle-orm";
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { imageMetadata } from "astro/assets/utils";
import { media } from "../../src/db/schema";
import { LOCAL_DIR, LOCAL_PREFIX } from "../../src/lib/media-store";
import type { Database } from "../../src/db/client";

/**
 * Meter imágenes en la biblioteca de un sitio desde un guion.
 *
 * Sin esto, un sitio sembrado sale sin una sola foto: los campos de imagen guardan la URL
 * de un archivo que hay que haber subido antes, y subirlo es un formulario del backoffice.
 * Una web de panadería sin fotos no enseña nada, y pedirle a quien prueba el producto que
 * suba nueve imágenes a mano antes de ver cómo queda es pedirle que no lo pruebe.
 *
 * **Sólo para desarrollo.** Escribe en `public/uploads/`, que es donde el almacén local
 * deja los archivos cuando no hay R2 —la misma ruta y la misma convención de clave que usa
 * la acción de subida, `${siteId}/${id}.${ext}`, para que lo sembrado y lo subido a mano
 * sean indistinguibles. En producción los archivos viven en R2 y esto no sirve: ahí se
 * suben por el backoffice o se sincroniza el bucket.
 *
 * Idempotente: el id sale de la clave declarada, así que relanzar no vuelve a descargar ni
 * duplica filas. Las imágenes se descargan de su origen en cada instalación nueva en vez de
 * guardarse en el repositorio, que no es sitio para binarios de ejemplo.
 */

export type ImagenRemota = {
  /**
   * Con lo que se referencia desde el contenido: `image: "@portada"`. Sólo minúsculas y
   * números — el id del medio se construye con ella y el lector de URL sólo reconoce
   * `media_[A-Za-z0-9]+`, así que un guion bajo aquí rompería la búsqueda de dimensiones.
   */
  key: string;
  url: string;
  /**
   * El texto alternativo. Obligatorio a propósito: una imagen sin él es una imagen que no
   * existe para quien navega con lector de pantalla, y es el campo que nadie rellena
   * después.
   */
  alt: string;
  /** De dónde sale. No se usa para nada: está para poder responder de dónde salió. */
  credit?: string;
};

const C = { reset: "\x1b[0m", dim: "\x1b[2m", green: "\x1b[32m", yellow: "\x1b[33m" };

function idDeClave(key: string): string {
  const limpio = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!limpio) throw new Error(`La clave de imagen "${key}" no deja nada utilizable.`);
  return `media_${limpio}`;
}

async function existe(ruta: string): Promise<boolean> {
  try {
    await access(ruta);
    return true;
  } catch {
    return false;
  }
}

/**
 * Descarga, guarda y registra cada imagen. Devuelve la URL pública de cada clave, que es lo
 * que va escrito en el campo: los campos de contenido guardan la URL, no el id.
 */
export async function instalarImagenes(
  db: Database,
  siteId: string,
  imagenes: ImagenRemota[],
  opciones: { dry?: boolean } = {}
): Promise<Map<string, string>> {
  const urlPorClave = new Map<string, string>();
  if (!imagenes.length) return urlPorClave;

  const yaEnBase = new Map(
    (await db.query.media.findMany({ where: eq(media.siteId, siteId), columns: { id: true, url: true } })).map(
      (m) => [m.id, m.url]
    )
  );

  for (const imagen of imagenes) {
    const id = idDeClave(imagen.key);
    const ext = (imagen.url.split("?")[0].split(".").pop() ?? "jpg").toLowerCase().slice(0, 4);
    const storageKey = `${siteId}/${id}.${ext === "jpeg" ? "jpg" : ext}`;
    const url = `${LOCAL_PREFIX}/${storageKey}`;
    const destino = join(LOCAL_DIR, storageKey);

    urlPorClave.set(imagen.key, url);

    if (yaEnBase.has(id) && (await existe(destino))) {
      console.log(`  ${C.dim}=${C.reset} ${url}  ${C.dim}${imagen.alt}${C.reset}`);
      continue;
    }

    if (opciones.dry) {
      console.log(`  ${C.green}+${C.reset} ${url}  ${C.dim}descargaría de ${imagen.url}${C.reset}`);
      continue;
    }

    const respuesta = await fetch(imagen.url);
    if (!respuesta.ok) {
      // Una imagen que no baja no puede parar la siembra entera: el resto del sitio se
      // escribe igual y ese campo queda vacío, que es un hueco visible y arreglable.
      console.log(`  ${C.yellow}!${C.reset} ${imagen.key}: ${respuesta.status} al descargar, se omite`);
      urlPorClave.delete(imagen.key);
      continue;
    }

    const bytes = await respuesta.arrayBuffer();

    /*
     * Las dimensiones se leen de la cabecera con la utilidad de Astro, la misma que usa la
     * subida. Sin ellas la página no puede reservar el hueco de la imagen y todo salta al
     * cargar, que es justo lo que se ve mal en una web llena de fotos.
     */
    let dimensiones: { width: number; height: number } | null = null;
    try {
      const meta = await imageMetadata(new Uint8Array(bytes));
      if (meta?.width && meta?.height) {
        const girada = typeof meta.orientation === "number" && meta.orientation >= 5;
        dimensiones = girada
          ? { width: meta.height, height: meta.width }
          : { width: meta.width, height: meta.height };
      }
    } catch {
      // Cabecera ilegible: se guarda igual, sin hueco reservado.
    }

    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, Buffer.from(bytes));

    const fila = {
      siteId,
      type: "image" as const,
      storageKey,
      url,
      altText: imagen.alt,
      ...(dimensiones ?? {}),
      sizeBytes: bytes.byteLength,
    };

    if (yaEnBase.has(id)) {
      await db.update(media).set(fila).where(and(eq(media.id, id), eq(media.siteId, siteId)));
    } else {
      await db.insert(media).values({ ...fila, id, createdAt: new Date() });
    }

    const tamano = `${Math.round(bytes.byteLength / 1024)} kB`;
    const medida = dimensiones ? `${dimensiones.width}×${dimensiones.height}` : "sin medidas";
    console.log(`  ${C.green}+${C.reset} ${url}  ${C.dim}${medida}, ${tamano}${C.reset}`);
  }

  return urlPorClave;
}

/**
 * Cambia cada `@clave` por la URL de su imagen, en cualquier profundidad.
 *
 * Un `@algo` que no sea una clave declarada se queda como está: en un texto puede haber una
 * arroba legítima —un usuario de Instagram, un correo— y convertirla en un hueco vacío
 * sería peor que dejarla.
 */
export function resolverImagenes<T>(valor: T, urlPorClave: Map<string, string>): T {
  if (typeof valor === "string") {
    if (!valor.startsWith("@")) return valor;
    const url = urlPorClave.get(valor.slice(1));
    return (url ?? valor) as unknown as T;
  }
  if (Array.isArray(valor)) return valor.map((v) => resolverImagenes(v, urlPorClave)) as unknown as T;
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, resolverImagenes(v, urlPorClave)])
    ) as unknown as T;
  }
  return valor;
}
