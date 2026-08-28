import { and, eq } from "drizzle-orm";
import { nodes, contentTypes, media, settings } from "@db/schema";
import { generateId, slugify, computePath, reservedSlugError } from "@lib/id";
import { requirePermission, isAdmin, viewableContentTypeIds } from "@lib/permissions";
import { sanitizeFields } from "@lib/sanitize";
import { invalidateNode, invalidateSettings } from "@lib/cache-invalidate";
import { ToolError, objectSchema, S, type ToolDefinition } from "../types";

/**
 * The content tools, moved out of the route's switch statement.
 *
 * Same behaviour and same guards; what changes is that the description an agent reads and the
 * handler that runs are now one declaration. Before, `tools/list` was a hand-written array
 * next to the switch, and the two could disagree — a tool renamed in one and not the other is
 * a tool an agent can see and not call, or call and not see.
 */
export const contentTools: ToolDefinition[] = [
  {
    name: "list_content_types",
    description: "Los tipos de contenido del sitio que este token puede ver.",
    inputSchema: objectSchema({}),
    handler: async (_params, context) => {
      const types = await context.db.query.contentTypes.findMany({
        where: eq(contentTypes.siteId, context.siteId),
      });
      const viewable = await viewableContentTypeIds(context.db, context.userId, context.siteId);
      return types.filter((type) => viewable.has(type.id));
    },
  },

  {
    name: "list_nodes",
    description: "Las páginas del sitio, filtrables por tipo y estado.",
    inputSchema: objectSchema({
      contentTypeId: S.string("Sólo de este tipo"),
      status: S.enum("Sólo en este estado", ["draft", "published", "scheduled"]),
    }),
    handler: async (params, context) => {
      const conditions = [eq(nodes.siteId, context.siteId)];
      if (params.contentTypeId) conditions.push(eq(nodes.contentTypeId, String(params.contentTypeId)));
      if (params.status) {
        conditions.push(eq(nodes.status, params.status as "draft" | "published" | "scheduled"));
      }
      const list = await context.db.query.nodes.findMany({
        where: and(...conditions),
        with: { contentType: true },
        orderBy: (n, { desc }) => [desc(n.updatedAt)],
      });
      const viewable = await viewableContentTypeIds(context.db, context.userId, context.siteId);
      return list.filter((node) => viewable.has(node.contentTypeId));
    },
  },

  {
    name: "get_node",
    description: "Una página completa, por id o por ruta.",
    inputSchema: objectSchema({
      id: S.string("Id del nodo"),
      path: S.string("Ruta, p. ej. «/contacto»"),
    }),
    handler: async (params, context) => {
      const id = params.id ? String(params.id) : "";
      const path = params.path ? String(params.path) : "";
      if (!id && !path) throw new ToolError("Hace falta «id» o «path»");

      const node = await context.db.query.nodes.findFirst({
        where: and(
          eq(nodes.siteId, context.siteId),
          id ? eq(nodes.id, id) : eq(nodes.path, path)
        ),
        with: { contentType: true },
      });
      if (!node) throw new ToolError("No existe esa página", "notFound");
      await requirePermission(context.db, context.userId, context.siteId, node.contentTypeId, "view");
      return node;
    },
  },

  {
    name: "create_node",
    description: "Crea una página. Nace como borrador: publicarla es otra llamada, a propósito.",
    mutates: true,
    inputSchema: objectSchema(
      {
        contentTypeId: S.string("Id del tipo de contenido"),
        title: S.string("Título"),
        slug: S.string("Slug. Vacío se deriva del título."),
        parentId: S.string("Id del nodo padre, para anidar"),
        locale: S.string("Idioma. Por defecto el del sitio."),
        fields: S.object("Valores de los campos del tipo"),
        seo: S.object("metaTitle, metaDescription, ogImage, canonical, noindex"),
      },
      ["contentTypeId", "title"]
    ),
    handler: async (params, context) => {
      const contentTypeId = String(params.contentTypeId ?? "");
      const title = String(params.title ?? "");
      if (!contentTypeId || !title) throw new ToolError("Hacen falta «contentTypeId» y «title»");

      const type = await context.db.query.contentTypes.findFirst({
        where: and(eq(contentTypes.id, contentTypeId), eq(contentTypes.siteId, context.siteId)),
      });
      if (!type) throw new ToolError("No existe ese tipo de contenido", "notFound");
      await requirePermission(context.db, context.userId, context.siteId, contentTypeId, "create");

      const locale = params.locale ? String(params.locale) : context.defaultLocale;
      const slug = slugify(String(params.slug ?? title));
      const parentId = params.parentId ? String(params.parentId) : null;

      const reserved = reservedSlugError(slug, Boolean(parentId));
      if (reserved) throw new ToolError(reserved);

      let parentPath: string | null = null;
      if (parentId) {
        const parent = await context.db.query.nodes.findFirst({
          where: and(eq(nodes.id, parentId), eq(nodes.siteId, context.siteId)),
        });
        if (!parent) throw new ToolError("No existe el nodo padre", "notFound");
        parentPath = parent.path;
      }

      const path = computePath(parentPath, slug, locale, context.defaultLocale);
      const existing = await context.db.query.nodes.findFirst({
        where: and(eq(nodes.siteId, context.siteId), eq(nodes.path, path)),
      });
      if (existing) {
        throw new ToolError(
          slug === "index" && !parentId
            ? `El slug "index" es la portada de este idioma (${path}), y ya existe.`
            : `Ya existe una página en "${path}".`,
          "conflict"
        );
      }

      const id = generateId("node");
      const now = new Date();
      await context.db.insert(nodes).values({
        id,
        siteId: context.siteId,
        contentTypeId,
        parentId,
        locale,
        slug,
        path,
        position: 0,
        status: "draft",
        title,
        fields: sanitizeFields((params.fields ?? {}) as Record<string, unknown>),
        seo: (params.seo ?? {}) as Record<string, unknown>,
        createdBy: context.userId,
        createdVia: "mcp",
        createdAt: now,
        updatedAt: now,
      });

      await invalidateNode(context.cache, {
        siteId: context.siteId,
        nodeId: id,
        contentTypeId,
        parentId,
      });

      return { id, path, status: "draft" };
    },
  },

  {
    name: "update_node",
    description:
      "Cambia el título, el slug, los campos o el SEO de una página. Para un solo bloque de " +
      "secciones usa patch_section, que no obliga a reenviar el resto.",
    mutates: true,
    inputSchema: objectSchema(
      {
        id: S.string("Id del nodo"),
        title: S.string("Nuevo título"),
        slug: S.string("Nuevo slug. Cambia la ruta."),
        fields: S.object("Valores a reemplazar"),
        seo: S.object("SEO a reemplazar"),
      },
      ["id"]
    ),
    handler: async (params, context) => {
      const id = String(params.id ?? "");
      const node = await context.db.query.nodes.findFirst({
        where: and(eq(nodes.id, id), eq(nodes.siteId, context.siteId)),
      });
      if (!node) throw new ToolError("No existe esa página", "notFound");
      await requirePermission(context.db, context.userId, context.siteId, node.contentTypeId, "edit");

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (params.title !== undefined) patch.title = String(params.title);
      if (params.fields !== undefined) {
        patch.fields = sanitizeFields(params.fields as Record<string, unknown>);
      }
      if (params.seo !== undefined) patch.seo = params.seo;

      if (params.slug !== undefined) {
        const newSlug = slugify(String(params.slug));
        const reserved = reservedSlugError(newSlug, Boolean(node.parentId));
        if (reserved) throw new ToolError(reserved);
        const parentPath = node.path.substring(0, node.path.lastIndexOf("/")) || null;
        patch.slug = newSlug;
        patch.path = computePath(parentPath, newSlug, node.locale, context.defaultLocale);
      }

      await context.db
        .update(nodes)
        .set(patch)
        .where(and(eq(nodes.id, id), eq(nodes.siteId, context.siteId)));
      await invalidateNode(context.cache, {
        siteId: context.siteId,
        nodeId: id,
        contentTypeId: node.contentTypeId,
        parentId: node.parentId,
      });
      return { id, ...(patch.path ? { path: patch.path } : {}) };
    },
  },

  {
    name: "publish_node",
    description: "Publica una página. Necesita permiso de publicación sobre su tipo.",
    mutates: true,
    inputSchema: objectSchema({ id: S.string("Id del nodo") }, ["id"]),
    handler: async (params, context) => {
      const id = String(params.id ?? "");
      const node = await context.db.query.nodes.findFirst({
        where: and(eq(nodes.id, id), eq(nodes.siteId, context.siteId)),
      });
      if (!node) throw new ToolError("No existe esa página", "notFound");
      await requirePermission(context.db, context.userId, context.siteId, node.contentTypeId, "publish");

      const now = new Date();
      await context.db
        .update(nodes)
        .set({ status: "published", publishedAt: now, updatedAt: now })
        .where(and(eq(nodes.id, id), eq(nodes.siteId, context.siteId)));

      await invalidateNode(context.cache, {
        siteId: context.siteId,
        nodeId: id,
        contentTypeId: node.contentTypeId,
        parentId: node.parentId,
      });
      return { id, path: node.path, publishedAt: now };
    },
  },

  {
    name: "delete_node",
    description: "Borra una página. Se niega si tiene hijos, para no dejarlos huérfanos.",
    mutates: true,
    inputSchema: objectSchema({ id: S.string("Id del nodo") }, ["id"]),
    handler: async (params, context) => {
      const id = String(params.id ?? "");
      const node = await context.db.query.nodes.findFirst({
        where: and(eq(nodes.id, id), eq(nodes.siteId, context.siteId)),
      });
      if (!node) throw new ToolError("No existe esa página", "notFound");
      await requirePermission(context.db, context.userId, context.siteId, node.contentTypeId, "delete");

      const children = await context.db.query.nodes.findMany({
        where: and(eq(nodes.parentId, id), eq(nodes.siteId, context.siteId)),
      });
      if (children.length > 0) {
        throw new ToolError(
          `Esa página tiene ${children.length} hija(s). Bórralas o muévelas primero.`,
          "conflict"
        );
      }

      await context.db.delete(nodes).where(and(eq(nodes.id, id), eq(nodes.siteId, context.siteId)));
      await invalidateNode(context.cache, {
        siteId: context.siteId,
        nodeId: id,
        contentTypeId: node.contentTypeId,
        parentId: node.parentId,
      });
      return { id, deleted: true };
    },
  },

  {
    name: "list_media",
    description:
      "Los archivos de la biblioteca, con su URL, su texto alternativo y sus dimensiones. " +
      "Los campos de imagen guardan la URL, así que es de aquí de donde se copia.",
    inputSchema: objectSchema({}),
    handler: async (_params, context) =>
      context.db.query.media.findMany({
        where: eq(media.siteId, context.siteId),
        orderBy: (m, { desc }) => [desc(m.createdAt)],
      }),
  },

  {
    name: "search_content",
    description: "Busca páginas por título o por ruta.",
    inputSchema: objectSchema({ query: S.string("Texto a buscar") }, ["query"]),
    handler: async (params, context) => {
      const query = String(params.query ?? "").trim().toLowerCase();
      if (!query) throw new ToolError("Hace falta «query»");

      const all = await context.db.query.nodes.findMany({
        where: eq(nodes.siteId, context.siteId),
        with: { contentType: true },
      });
      const viewable = await viewableContentTypeIds(context.db, context.userId, context.siteId);
      return all.filter(
        (node) =>
          viewable.has(node.contentTypeId) &&
          (node.title.toLowerCase().includes(query) || node.path.toLowerCase().includes(query))
      );
    },
  },

  {
    name: "get_settings",
    description: "Los ajustes del sitio. Sólo administradores: incluye claves de servicios.",
    inputSchema: objectSchema({}),
    handler: async (_params, context) => {
      if (!(await isAdmin(context.db, context.userId, context.siteId))) {
        throw new ToolError("Se requiere rol de administrador", "forbidden");
      }
      return context.db.query.settings.findFirst({ where: eq(settings.siteId, context.siteId) });
    },
  },

  {
    name: "update_settings",
    description: "Cambia ajustes del sitio. Sólo administradores, y sólo un subconjunto seguro.",
    mutates: true,
    inputSchema: objectSchema({
      siteName: S.string("Nombre del sitio"),
      tagline: S.string("Lema"),
      theme: S.object("Tema: colores, fuentes, ancho, escala"),
      socialLinks: S.object("Enlaces sociales"),
      analyticsIds: S.object("Identificadores de analítica"),
    }),
    handler: async (params, context) => {
      if (!(await isAdmin(context.db, context.userId, context.siteId))) {
        throw new ToolError("Se requiere rol de administrador", "forbidden");
      }

      /*
       * An allowlist, not a passthrough.
       *
       * `integrations` holds the Resend key and the Turnstile secret, and `business` and
       * `menus` have their own validated paths. An agent that could write them would be able
       * to point the site's mail at itself, or rewrite navigation, from a single fuzzy
       * instruction.
       */
      const allowed = ["siteName", "tagline", "theme", "socialLinks", "analyticsIds"];
      const patch: Record<string, unknown> = {};
      for (const key of allowed) {
        if (params[key] !== undefined) patch[key] = params[key];
      }
      if (Object.keys(patch).length === 0) {
        throw new ToolError(`Nada que cambiar. Admite: ${allowed.join(", ")}.`);
      }

      await context.db.update(settings).set(patch).where(eq(settings.siteId, context.siteId));
      await invalidateSettings(context.cache, context.siteId);
      return { ok: true, updated: Object.keys(patch) };
    },
  },
];
