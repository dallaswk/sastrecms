import "dotenv/config";
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../src/db/schema";
import { nodes, contentTypes, settings, sites } from "../../src/db/schema";
import { createControlDb } from "../../src/db/control-client";
import { tenants } from "../../src/db/control-schema";
import { DEFAULT_SITE_ID } from "../../src/lib/site";
import { getSection } from "../../src/lib/sections/registry";
import { computePath, generateId } from "../../src/lib/id";
import type { FieldDefinition } from "../../src/lib/fields/types";
import type { SectionInstance } from "../../src/lib/sections/types";
import type { SiteMenus, MenuItem, MenuKey } from "../../src/lib/menus";
import type { SiteTheme } from "../../src/db/schema";
import { instalarImagenes, resolverImagenes, type ImagenRemota } from "./site-media";

/**
 * Escribir contenido en un sitio desde un guion.
 *
 * Existe porque la alternativa —copiar `landing.ts` cada vez que hay que llenar una web—
 * duplica trescientas líneas de maquinaria delicada (rutas jerárquicas, referencias entre
 * bloques, menús por id) para cambiar sólo el texto. Aquí queda la maquinaria; el guion
 * que la llama es una declaración de páginas y nada más.
 *
 * Lo que garantiza, y que es la razón de que esto no sea un `INSERT` suelto:
 *
 * - **Idempotente por ruta.** Cada página se identifica por su `path`, así que relanzar
 *   actualiza en su sitio en vez de duplicar. Se puede iterar sobre el texto sin ir
 *   limpiando la base entre pasadas.
 * - **Ids estables.** Los bloques llevan `sec_<pagina>_<n>`, deterministas. Si cambiasen
 *   en cada pasada, el historial de revisiones compararía cosas que no son la misma y
 *   dejaría de servir para nada.
 * - **Padres antes que hijos.** Las rutas se construyen de la jerarquía, en dos pasadas,
 *   para que un bloque pueda apuntar a una página declarada después.
 *
 * Lo que NO toca nunca: usuarios, roles, permisos, medios y envíos de formulario. Eso es
 * del que administra el sitio, no del texto.
 */

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m",
};

/* ----------------------------------------------------------------- los tipos */

export type Bloque = {
  /** Clave del registro de secciones: `hero`, `features`, `faq`… */
  type: string;
  /** Ancla para enlazar a la sección desde un menú o un botón. */
  anchor?: string;
  /** Montado pero sin pintar. Para dejar un bloque listo a falta de contenido real. */
  hidden?: boolean;
  data: Record<string, unknown>;
};

export type Pagina = {
  slug: string;
  /** Slug de otra página de la misma lista. Los padres se declaran antes que los hijos. */
  parentSlug?: string;
  title: string;
  /** Clave del tipo de contenido. Por defecto `page`. */
  typeKey?: string;
  position?: number;
  seo?: { metaTitle?: string; metaDescription?: string };
  /** Bloques, para las páginas montadas con secciones. */
  sections?: Bloque[];
  /** Campos sueltos, para lo que no son secciones: el cuerpo de un post, una ficha. */
  fields?: Record<string, unknown>;
  /** Fecha fija de publicación, para que un listado tenga un orden estable. */
  publishedAt?: string;
  /** Por defecto se publica. En borrador para lo que aún no debe verse. */
  draft?: boolean;
};

export type TipoContenido = {
  key: string;
  label: string;
  icon?: string;
  hasArchive?: boolean;
  supportsChildren?: boolean;
  fieldSchema: FieldDefinition[];
};

export type EntradaMenu = { label: string; path: string } | { label: string; url: string };

export type Contenido = {
  /** Slug del inquilino en el plano de control. Sin él, la base por defecto. */
  tenant?: string;
  siteName?: string;
  tagline?: string;
  theme?: SiteTheme;
  contactEmail?: string;
  socialLinks?: Record<string, string>;
  /** Datos de empresa: de aquí salen el aviso legal y la política de privacidad. */
  business?: Record<string, string>;
  /**
   * Imágenes que hay que meter en la biblioteca antes de escribir las páginas. Desde el
   * contenido se referencian por su clave: `image: "@portada"`.
   */
  images?: ImagenRemota[];
  /** Tipos propios, además de los que ya trae la base. */
  contentTypes?: TipoContenido[];
  pages: Pagina[];
  menus?: Partial<Record<MenuKey, EntradaMenu[]>>;
  /**
   * Rutas que este contenido deja huérfanas. Van a la papelera (`deleted_at`), no se
   * borran: un DELETE sería irreversible y se llevaría por delante las revisiones que
   * cuelgan de ese nodo.
   */
  retire?: string[];
};

export type Opciones = {
  /** Enseña qué haría y no escribe nada. */
  dry?: boolean;
  /** Gana al `tenant` del contenido, para probar el mismo texto en otro sitio. */
  tenant?: string;
};

/** Lee `--dry` y `--tenant=<slug>` de la línea de órdenes. */
export function opcionesDeArgv(argv: string[] = process.argv): Opciones {
  const tenant = argv.find((a) => a.startsWith("--tenant="))?.slice("--tenant=".length);
  return { dry: argv.includes("--dry"), ...(tenant ? { tenant } : {}) };
}

/* ------------------------------------------------------------------- destino */

/**
 * A qué base hay que escribir.
 *
 * La saca del plano de control a partir del slug del inquilino, en vez de llevar la ruta
 * escrita: un inquilino puede tener base propia o seguir en la compartida, y quien sabe
 * cuál de las dos es es el plano de control. Sin él configurado, la de siempre.
 */
async function baseDelSitio(slug?: string): Promise<{ url: string; authToken?: string; donde: string }> {
  const compartida = () => {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL no está puesta.");
    return { url, authToken: process.env.TURSO_AUTH_TOKEN };
  };

  if (!slug) return { ...compartida(), donde: "base por defecto" };

  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) throw new Error(`Para escribir en "${slug}" hace falta CONTROL_DATABASE_URL.`);

  const control = createControlDb(controlUrl, process.env.CONTROL_AUTH_TOKEN);
  const inquilino = await control.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
  if (!inquilino) throw new Error(`El plano de control no tiene ningún inquilino con slug "${slug}".`);

  if (inquilino.databaseUrl) {
    return {
      url: inquilino.databaseUrl,
      authToken: inquilino.databaseAuthToken ?? undefined,
      donde: `${inquilino.name} · base propia`,
    };
  }
  return { ...compartida(), donde: `${inquilino.name} · base compartida` };
}

/* ------------------------------------------------------------------ bloques */

/** Un id de bloque estable: la misma página en la misma posición vuelve al mismo id. */
function idBloque(slug: string, index: number): string {
  return `sec_${slug.replace(/[^a-z0-9]+/gi, "_")}_${index}`;
}

/**
 * Sella los bloques: id estable, versión del registro y referencias resueltas.
 *
 * Los campos `relation` de un bloque traen el *slug* de otra página de la misma lista,
 * porque los ids no existen hasta que el guion los crea. Cuáles son esos campos lo dice la
 * definición del bloque, así que un bloque nuevo con su propia relación funciona sin
 * tocar esto.
 */
function sellarBloques(
  pagina: Pagina,
  idsPorSlug: Map<string, string>,
  urlPorClave: Map<string, string>
): SectionInstance[] {
  return (pagina.sections ?? []).map((bloque, index) => {
    const def = getSection(bloque.type);
    if (!def) throw new Error(`La página "${pagina.slug}" usa un bloque inexistente: "${bloque.type}"`);

    const data = resolverImagenes({ ...bloque.data }, urlPorClave);
    for (const campo of def.fields.filter((f) => f.type === "relation")) {
      const referencia = data[campo.key];
      if (typeof referencia !== "string" || !referencia) continue;
      const id = idsPorSlug.get(referencia);
      if (!id) throw new Error(`"${pagina.slug}": el bloque ${bloque.type} apunta a "${referencia}", que no existe`);
      data[campo.key] = id;
    }

    return {
      id: idBloque(pagina.slug, index),
      type: bloque.type,
      v: def.version,
      data,
      ...(bloque.hidden ? { hidden: true } : {}),
      ...(bloque.anchor ? { anchor: bloque.anchor } : {}),
    };
  });
}

/* ---------------------------------------------------------------- escritura */

export async function seedSite(contenido: Contenido, opciones: Opciones = {}): Promise<void> {
  const DRY = opciones.dry ?? false;
  const destino = await baseDelSitio(opciones.tenant ?? contenido.tenant);
  const client = createClient({ url: destino.url, authToken: destino.authToken });
  const db = drizzle(client, { schema });
  const SITE_ID = DEFAULT_SITE_ID;

  console.log(
    `${C.bold}${C.cyan}${contenido.siteName ?? "Contenido"}${C.reset} ${C.dim}→ ${destino.donde}${C.reset}` +
      `${DRY ? `${C.dim} (simulación)${C.reset}` : ""}\n`
  );

  /* ---- los tipos de contenido que hacen falta */
  const tipos = await db.query.contentTypes.findMany({ where: eq(contentTypes.siteId, SITE_ID) });
  const tipoPorClave = new Map(tipos.map((t) => [t.key, t]));

  const paginaBase = tipoPorClave.get("page");
  if (!paginaBase) throw new Error("Esta base no tiene el tipo «page». Lanza antes el aprovisionamiento.");

  /*
   * La página necesita un campo de secciones o los bloques no se pintan: el sembrado deja
   * los tipos base con `body` y nada más, porque montar la página con bloques es una
   * decisión de quien monta el sitio, no de la base.
   */
  if (!(paginaBase.fieldSchema ?? []).some((f) => f.type === "sections")) {
    const esquema = [
      ...(paginaBase.fieldSchema ?? []),
      { key: "bloques", label: "Secciones", type: "sections" } as FieldDefinition,
    ];
    if (!DRY) {
      await db.update(contentTypes).set({ fieldSchema: esquema }).where(eq(contentTypes.id, paginaBase.id));
    }
    tipoPorClave.set("page", { ...paginaBase, fieldSchema: esquema });
    console.log(`  ${C.green}+${C.reset} tipo «page»: campo de secciones ${C.dim}(bloques)${C.reset}`);
  }

  for (const tipo of contenido.contentTypes ?? []) {
    const existente = tipoPorClave.get(tipo.key);
    if (existente) {
      /*
       * Los campos se amplían, nunca se reescriben: la clave de un campo es inmutable
       * porque los valores viven en un JSON que la usa de índice, y sustituir el esquema
       * dejaría huérfano el contenido de todo lo que ya se hubiera escrito con él.
       */
      const claves = new Set((existente.fieldSchema ?? []).map((f) => f.key));
      const nuevos = tipo.fieldSchema.filter((f) => !claves.has(f.key));
      if (nuevos.length) {
        const esquema = [...(existente.fieldSchema ?? []), ...nuevos];
        if (!DRY) {
          await db.update(contentTypes).set({ fieldSchema: esquema }).where(eq(contentTypes.id, existente.id));
        }
        tipoPorClave.set(tipo.key, { ...existente, fieldSchema: esquema });
        console.log(`  ${C.dim}=${C.reset} tipo «${tipo.label}»: ${nuevos.length} campo(s) nuevo(s)`);
      }
      continue;
    }

    const nuevo = {
      id: generateId("ct"),
      siteId: SITE_ID,
      key: tipo.key,
      label: tipo.label,
      icon: tipo.icon ?? null,
      hasArchive: tipo.hasArchive ?? false,
      supportsChildren: tipo.supportsChildren ?? false,
      translatable: true,
      isSystem: false,
      fieldSchema: tipo.fieldSchema,
    };
    if (!DRY) await db.insert(contentTypes).values(nuevo);
    tipoPorClave.set(tipo.key, nuevo as (typeof tipos)[number]);
    console.log(`  ${C.green}+${C.reset} tipo de contenido «${tipo.label}»`);
  }

  for (const clave of new Set(contenido.pages.map((p) => p.typeKey ?? "page"))) {
    if (!tipoPorClave.has(clave)) throw new Error(`Esta base no tiene el tipo de contenido "${clave}".`);
  }

  const claveSecciones = new Map(
    [...tipoPorClave.values()].map((t) => [
      t.key,
      (t.fieldSchema ?? []).find((f) => f.type === "sections")?.key ?? null,
    ])
  );

  /*
   * Las imágenes, antes que las páginas: un campo de imagen guarda la URL del archivo, así
   * que el archivo tiene que existir y estar registrado para que haya URL que escribir.
   */
  const urlPorClave = await instalarImagenes(db, SITE_ID, contenido.images ?? [], { dry: DRY });

  /* ---- lo que ya hay, por ruta */
  const existentes = await db.query.nodes.findMany({
    where: eq(nodes.siteId, SITE_ID),
    columns: { id: true, path: true, publishedAt: true },
  });
  const yaEnBase = new Map(existentes.map((n) => [n.path, n]));

  /*
   * Primera pasada: rutas e ids, sin escribir. Hace falta porque un bloque puede apuntar a
   * otra página y esa referencia se guarda como id. Resolverla sobre la marcha obligaría a
   * ordenar las páginas por sus referencias en vez de por su jerarquía, que es la que
   * manda para construir las rutas.
   */
  const rutaPorSlug = new Map<string, string>();
  const idPorSlug = new Map<string, string>();
  const locale = "es";

  for (const pagina of contenido.pages) {
    const rutaPadre = pagina.parentSlug ? rutaPorSlug.get(pagina.parentSlug) : null;
    if (pagina.parentSlug && !rutaPadre) {
      throw new Error(`"${pagina.slug}" cuelga de "${pagina.parentSlug}", que no está declarada antes.`);
    }
    const ruta = computePath(rutaPadre ?? null, pagina.slug, locale, locale);
    rutaPorSlug.set(pagina.slug, ruta);
    idPorSlug.set(pagina.slug, yaEnBase.get(ruta)?.id ?? `node_${pagina.slug.replace(/[^a-z0-9]+/gi, "")}`);
  }

  /* ---- segunda pasada: escribir */
  const ahora = new Date();
  let creadas = 0;
  let actualizadas = 0;

  for (const pagina of contenido.pages) {
    const claveTipo = pagina.typeKey ?? "page";
    const tipo = tipoPorClave.get(claveTipo)!;
    const ruta = rutaPorSlug.get(pagina.slug)!;
    const id = idPorSlug.get(pagina.slug)!;
    const existe = yaEnBase.get(ruta);

    const campoSecciones = claveSecciones.get(claveTipo);
    const bloques = sellarBloques(pagina, idPorSlug, urlPorClave);
    if (bloques.length && !campoSecciones) {
      throw new Error(`El tipo "${claveTipo}" no tiene campo de secciones, y "${pagina.slug}" trae bloques.`);
    }

    /*
     * `body` vacío junto a los bloques: todos los renderizadores pintan `fields.body`, y
     * una página montada con secciones no debe además soltar un texto suelto encima.
     */
    const fields: Record<string, unknown> = {
      ...(campoSecciones && bloques.length ? { body: "", [campoSecciones]: bloques } : {}),
      ...resolverImagenes(pagina.fields ?? {}, urlPorClave),
    };

    const publicada = !pagina.draft;
    const publishedAt = pagina.publishedAt
      ? new Date(pagina.publishedAt)
      : existe?.publishedAt ?? (publicada ? ahora : null);

    const valores = {
      siteId: SITE_ID,
      contentTypeId: tipo.id,
      parentId: pagina.parentSlug ? idPorSlug.get(pagina.parentSlug)! : null,
      locale,
      slug: pagina.slug,
      path: ruta,
      position: pagina.position ?? 0,
      status: (publicada ? "published" : "draft") as "published" | "draft",
      publishedAt,
      publishAt: null,
      deletedAt: null,
      title: pagina.title,
      fields,
      seo: (pagina.seo ?? {}) as Record<string, unknown>,
      updatedAt: ahora,
    };

    const cuenta = bloques.length ? `${bloques.length} bloque(s)` : "ficha";
    if (DRY) {
      const marca = existe ? `${C.dim}=${C.reset}` : `${C.green}+${C.reset}`;
      console.log(`  ${marca} ${ruta}  ${C.dim}${pagina.title} · ${cuenta}${C.reset}`);
    } else if (existe) {
      await db.update(nodes).set(valores).where(eq(nodes.id, existe.id));
      actualizadas++;
      console.log(`  ${C.dim}=${C.reset} ${ruta}  ${C.dim}${cuenta}${C.reset}`);
    } else {
      await db.insert(nodes).values({ ...valores, id, createdAt: ahora, createdVia: "web" });
      creadas++;
      console.log(`  ${C.green}+${C.reset} ${ruta}  ${C.dim}${cuenta}${C.reset}`);
    }
  }

  /* ---- a la papelera lo que este contenido deja huérfano */
  for (const ruta of contenido.retire ?? []) {
    const viejo = yaEnBase.get(ruta);
    if (!viejo) continue;
    if (!DRY) {
      await db.update(nodes).set({ deletedAt: ahora, updatedAt: ahora }).where(eq(nodes.id, viejo.id));
    }
    console.log(`  ${C.yellow}-${C.reset} ${ruta}  ${C.dim}a la papelera${C.reset}`);
  }

  /*
   * Menús: guardan ids, no rutas, para que renombrar un slug no rompa la navegación de
   * todas las páginas a la vez. Por eso se resuelven contra lo que hay en la base después
   * de escribir —incluidas páginas que este guion no toca.
   */
  const menus: SiteMenus = {};
  if (contenido.menus) {
    const todas = await db.query.nodes.findMany({
      where: eq(nodes.siteId, SITE_ID),
      columns: { id: true, path: true, status: true, deletedAt: true },
    });
    const idPorRuta = new Map(
      todas.filter((n) => n.status === "published" && !n.deletedAt).map((n) => [n.path, n.id])
    );

    for (const [nombre, entradas] of Object.entries(contenido.menus) as [MenuKey, EntradaMenu[]][]) {
      const resueltas: MenuItem[] = [];
      for (const entrada of entradas) {
        if ("url" in entrada) {
          resueltas.push({ label: entrada.label, url: entrada.url });
          continue;
        }
        const id = idPorRuta.get(entrada.path);
        if (!id) {
          console.log(
            `  ${C.yellow}!${C.reset} el menú ${nombre} apunta a ${entrada.path}, que no existe publicada: se omite`
          );
          continue;
        }
        resueltas.push({ label: entrada.label, nodeId: id });
      }
      if (resueltas.length) menus[nombre] = resueltas;
    }
  }

  /* ---- ajustes: sólo lo que el contenido declara */
  const ajustes = {
    ...(contenido.siteName ? { siteName: contenido.siteName } : {}),
    ...(contenido.tagline !== undefined ? { tagline: contenido.tagline } : {}),
    ...(contenido.theme ? { theme: contenido.theme } : {}),
    ...(contenido.contactEmail ? { contactEmail: contenido.contactEmail } : {}),
    ...(contenido.socialLinks ? { socialLinks: contenido.socialLinks } : {}),
    ...(contenido.business ? { business: contenido.business } : {}),
    ...(Object.keys(menus).length ? { menus } : {}),
  };

  if (!DRY && Object.keys(ajustes).length) {
    await db.update(settings).set(ajustes).where(eq(settings.siteId, SITE_ID));
    if (contenido.siteName) {
      await db.update(sites).set({ name: contenido.siteName }).where(eq(sites.id, SITE_ID));
    }
  }

  const resumenMenus = Object.entries(menus).map(([k, v]) => `${k} (${v?.length})`).join(", ");
  console.log(
    `\n${C.green}✓${C.reset} ${creadas} creada(s), ${actualizadas} actualizada(s).` +
      (resumenMenus ? ` Menús: ${resumenMenus}.` : "")
  );
  if (DRY) console.log(`${C.dim}Simulación: no se ha escrito nada.${C.reset}`);
}

/** Envoltorio para un guion: ejecuta y falla con un mensaje legible, no con una traza. */
export async function ejecutar(contenido: Contenido, opciones = opcionesDeArgv()): Promise<void> {
  try {
    await seedSite(contenido, opciones);
  } catch (error) {
    console.error(`${C.red}✗${C.reset}`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
