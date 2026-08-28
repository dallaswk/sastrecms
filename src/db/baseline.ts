import { and, eq, isNull } from "drizzle-orm";
import * as schema from "./schema";
import type { Database } from "./client";
import { rolesForSite, roleId } from "../lib/roles";

/**
 * Lo mínimo que necesita una base para que la aplicación arranque contra ella.
 *
 * Estaba dentro de `seed.ts`, que lee variables de entorno y escribe por consola — perfecto para
 * arrancar el proyecto y inservible para aprovisionar el inquilino número treinta. Aquí recibe
 * una conexión y no supone nada sobre quién la llama: el seed, el aprovisionamiento y cualquier
 * prueba aplican exactamente la misma base, que es la única forma de que no se separen.
 *
 * No incluye contenido de ejemplo. Los textos, el tema y las páginas de un sector concreto son
 * cosa de los presets; esto es lo que sin ello no se puede ni entrar al backoffice.
 */

/**
 * Todos los renderers pintan `fields.body`, así que cada tipo base tiene que declararlo. Sin
 * esto el editor ofrece título, slug y SEO, y la página sale en blanco.
 */
const BODY_FIELD = { key: "body", label: "Contenido", type: "richtext" as const };

/**
 * Los ids de los tipos base son fijos.
 *
 * Aguanta porque cada inquilino tiene su propia base con un solo sitio dentro, y `ct_page` no
 * tiene con qué colisionar. Los sitios que comparten base —el modelo de transición— se crean
 * con ids generados, no con éstos: dos sitios en una base con `ct_page` fijo es exactamente el
 * fallo que tenían los roles, donde el segundo insert chocaba con la clave primaria,
 * `onConflictDoNothing` se lo tragaba, y el sitio se quedaba sin nada y sin decir por qué.
 */
export function baselineContentTypes(siteId: string) {
  return [
    {
      id: "ct_page",
      siteId,
      key: "page",
      label: "Página",
      icon: "file",
      hasArchive: false,
      supportsChildren: true,
      translatable: true,
      isSystem: true,
      fieldSchema: [BODY_FIELD] as schema.FieldDefinition[],
    },
    {
      id: "ct_post",
      siteId,
      key: "post",
      label: "Post",
      icon: "newspaper",
      hasArchive: true,
      supportsChildren: false,
      translatable: true,
      isSystem: true,
      fieldSchema: [
        { key: "excerpt", label: "Extracto", type: "textarea" as const },
        { key: "cover_image", label: "Imagen de portada", type: "image" as const },
        BODY_FIELD,
      ] as schema.FieldDefinition[],
    },
    {
      id: "ct_portfolio_item",
      siteId,
      key: "portfolio_item",
      label: "Portfolio",
      icon: "briefcase",
      hasArchive: true,
      supportsChildren: false,
      translatable: true,
      isSystem: true,
      fieldSchema: [
        { key: "client", label: "Cliente", type: "text" as const },
        { key: "year", label: "Año", type: "number" as const },
        { key: "gallery", label: "Galería", type: "gallery" as const },
        { key: "url", label: "URL del proyecto", type: "text" as const },
        BODY_FIELD,
      ] as schema.FieldDefinition[],
    },
  ];
}

export type BaselineOptions = {
  siteId: string;
  siteName: string;
  defaultLocale?: string;
  locales?: string[];
};

/**
 * Aplica la base. Idempotente: se puede volver a lanzar sobre una base que ya la tiene.
 *
 * Idempotente no es un detalle de comodidad. Aprovisionar es crear la base, migrarla y sembrarla,
 * y cualquiera de los tres puede cortarse por la mitad; si repetir no fuera seguro, recuperarse
 * de un corte sería borrar y empezar de cero.
 */
export async function applyBaseline(db: Database, options: BaselineOptions): Promise<void> {
  const { siteId, siteName, defaultLocale = "es", locales = ["es"] } = options;

  await db
    .insert(schema.sites)
    .values({ id: siteId, name: siteName, defaultLocale, locales })
    .onConflictDoNothing();

  for (const contentType of baselineContentTypes(siteId)) {
    await db.insert(schema.contentTypes).values(contentType).onConflictDoNothing();
  }

  for (const role of rolesForSite(siteId)) {
    await db.insert(schema.roles).values(role).onConflictDoNothing();
  }

  /*
   * El comodín del administrador: `contentTypeId` nulo = todos los tipos, incluidos los que
   * todavía no existen. Un administrador al que hubiera que repermisionar cada vez que alguien
   * crea un tipo no sería administrador.
   *
   * Se comprueba por contenido y no con `onConflictDoNothing`, porque la tabla no tiene índice
   * único sobre (rol, tipo): ahí el conflicto sólo salta si coincide el id, y el id de esta
   * fila fue `perm_admin_wildcard` a secas antes de llevar el sitio dentro. Confiar en el id
   * insertaría un segundo comodín en cualquier base que ya existiera.
   */
  const adminRole = roleId(siteId, "admin");
  const wildcard = await db.query.roleContentPermissions.findFirst({
    where: and(
      eq(schema.roleContentPermissions.roleId, adminRole),
      isNull(schema.roleContentPermissions.contentTypeId)
    ),
  });
  if (!wildcard) {
    await db.insert(schema.roleContentPermissions).values({
      id: `perm_admin_wildcard_${siteId}`,
      roleId: adminRole,
      contentTypeId: null,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canPublish: true,
    });
  }

  await db
    .insert(schema.settings)
    .values({ siteId, siteName, tagline: "", theme: {}, socialLinks: {}, analyticsIds: {} })
    .onConflictDoNothing();
}
