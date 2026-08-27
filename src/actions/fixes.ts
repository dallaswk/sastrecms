import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { and, eq, isNull } from "drizzle-orm";
import { imageMetadata } from "astro/assets/utils";
import { contentTypes, media, nodes, settings } from "@db/schema";
import { generateId, computePath } from "@lib/id";
import { requireAdmin, requireSiteRole } from "@lib/permissions";
import { getSection } from "@lib/sections/registry";
import { sectionsFieldOf } from "@lib/renderers";
import { normalizeMenus, readMenu, type MenuItem } from "@lib/menus";
import { invalidateNode, invalidateSettings } from "@lib/cache-invalidate";
import { visibleNodes } from "@lib/node-queries";
import {
  AUTOMATIC_FIX_IDS,
  DEFAULT_CONTACT_FIELDS,
  LEGAL_PAGES,
  LEGAL_SLUGS,
  isAutomatic,
  type FixResult,
} from "@lib/fixes";
import type { Database } from "@db/client";

/**
 * The one-click fixes from the launch checklist.
 *
 * Every one of these is idempotent and reports what it actually did, including «nothing left to
 * do» — a button that says «Hecho» when it changed nothing teaches people not to trust it. And
 * none of them touch anything outside their own remit: the menu fix does not publish pages, the
 * legal fix does not edit the menu. Two separate rows, two separate decisions.
 */

type FixContext = {
  db: Database;
  siteId: string;
  userId: string;
  defaultLocale: string;
  cache?: { invalidate?: (options: { tags?: string | string[] }) => Promise<void> };
};

/** The `page` type and the key its section blocks live under. */
async function pageType(context: FixContext) {
  const type = await context.db.query.contentTypes.findFirst({
    where: and(eq(contentTypes.siteId, context.siteId), eq(contentTypes.key, "page")),
  });
  if (!type) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: 'No existe el tipo de contenido "page", así que no se pueden crear páginas.',
    });
  }
  const field = sectionsFieldOf(type);
  if (!field) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message:
        'El tipo "page" no tiene un campo de secciones, así que no se le pueden poner bloques. ' +
        "Añádelo en Tipos de contenido.",
    });
  }
  return { type, sectionsKey: field.key };
}

/* --------------------------------------------------------------- los arreglos */

async function fixLegalPages(context: FixContext): Promise<FixResult> {
  const { type, sectionsKey } = await pageType(context);
  const legalDef = getSection("legal");
  if (!legalDef) throw new ActionError({ code: "BAD_REQUEST", message: "Falta la sección legal." });

  const existing = await context.db.query.nodes.findMany({
    where: and(eq(nodes.siteId, context.siteId), isNull(nodes.deletedAt)),
    columns: { id: true, slug: true, path: true, status: true, fields: true },
  });
  const bySlug = new Map(existing.map((node) => [node.slug, node]));

  const created: string[] = [];
  const published: string[] = [];

  for (const page of LEGAL_PAGES) {
    const current = bySlug.get(page.slug);
    const block = {
      id: generateId("sec"),
      type: "legal",
      v: legalDef.version,
      data: { document: page.document, show_disclaimer: "sí" },
    };

    if (!current) {
      const id = generateId("node");
      const now = new Date();
      await context.db.insert(nodes).values({
        id,
        siteId: context.siteId,
        contentTypeId: type.id,
        parentId: null,
        locale: context.defaultLocale,
        slug: page.slug,
        path: computePath(null, page.slug, context.defaultLocale, context.defaultLocale),
        position: 100,
        status: "published",
        publishedAt: now,
        title: page.title,
        fields: { [sectionsKey]: [block] },
        seo: {},
        createdBy: context.userId,
        createdVia: "web",
        createdAt: now,
        updatedAt: now,
      });
      created.push(page.slug);
      await invalidateNode(context.cache, { siteId: context.siteId, nodeId: id, contentTypeId: type.id });
      continue;
    }

    // It exists. Two things can still be wrong, and both are fixed without touching anything
    // else the page might contain.
    const fields = { ...((current.fields ?? {}) as Record<string, unknown>) };
    const blocks = Array.isArray(fields[sectionsKey]) ? (fields[sectionsKey] as unknown[]) : [];
    const hasLegalBlock = blocks.some((b) => (b as { type?: string })?.type === "legal");

    const updates: Record<string, unknown> = {};
    if (!hasLegalBlock) {
      fields[sectionsKey] = [...blocks, block];
      updates.fields = fields;
    }
    if (current.status !== "published") {
      updates.status = "published";
      updates.publishedAt = new Date();
      published.push(page.slug);
    }

    if (Object.keys(updates).length > 0) {
      await context.db
        .update(nodes)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(nodes.id, current.id), eq(nodes.siteId, context.siteId)));
      if (!created.includes(page.slug) && !published.includes(page.slug)) created.push(page.slug);
      await invalidateNode(context.cache, {
        siteId: context.siteId,
        nodeId: current.id,
        contentTypeId: type.id,
      });
    }
  }

  if (created.length === 0 && published.length === 0) {
    return { message: "Las tres páginas legales ya estaban publicadas y con su bloque.", noop: true };
  }

  const parts: string[] = [];
  if (created.length) parts.push(`creadas o completadas: ${created.join(", ")}`);
  if (published.length) parts.push(`publicadas: ${published.join(", ")}`);
  return {
    message: `Páginas legales listas — ${parts.join("; ")}.`,
    changed: [...created, ...published],
  };
}

async function fixLegalMenu(context: FixContext): Promise<FixResult> {
  const now = new Date();
  const pages = await context.db.query.nodes.findMany({
    where: visibleNodes(context.siteId, now),
    columns: { id: true, slug: true, title: true, path: true },
  });
  const bySlug = new Map(pages.map((page) => [page.slug, page]));

  const row = await context.db.query.settings.findFirst({
    where: eq(settings.siteId, context.siteId),
    columns: { menus: true },
  });
  const current = readMenu(row?.menus, "legal");

  /*
   * Already linked, by node *or* by URL.
   *
   * Comparing only node ids added a second «Aviso legal» to a footer that already had one as a
   * raw URL — which is what a hand-written menu looks like, and what the presets write. Seen in
   * the rendered footer, not in the code.
   */
  const linkedNodeIds = new Set(current.map((item) => item.nodeId).filter(Boolean));
  const linkedPaths = new Set(
    current
      .map((item) => item.url?.trim().replace(/\/+$/, ""))
      .filter((url): url is string => !!url)
  );

  const added: string[] = [];
  const items: MenuItem[] = [...current];

  for (const page of LEGAL_PAGES) {
    const node = bySlug.get(page.slug);
    if (!node) continue;
    if (linkedNodeIds.has(node.id)) continue;
    if (linkedPaths.has(node.path.replace(/\/+$/, ""))) continue;
    items.push({ label: page.menuLabel, nodeId: node.id });
    added.push(page.menuLabel);
  }

  if (added.length === 0) {
    const missing = LEGAL_PAGES.filter((page) => !bySlug.has(page.slug));
    return missing.length > 0
      ? {
          message: `No hay nada que añadir: faltan por publicar ${missing.map((p) => p.slug).join(", ")}. Créalas primero.`,
          noop: true,
        }
      : { message: "Los enlaces legales ya estaban en el pie.", noop: true };
  }

  const menus = normalizeMenus({ ...((row?.menus ?? {}) as object), legal: items });
  await context.db.update(settings).set({ menus }).where(eq(settings.siteId, context.siteId));
  await invalidateSettings(context.cache, context.siteId);

  return { message: `Añadidos al pie: ${added.join(", ")}.`, changed: added };
}

async function fixMainMenu(context: FixContext): Promise<FixResult> {
  const now = new Date();
  const pages = await context.db.query.nodes.findMany({
    where: visibleNodes(context.siteId, now),
    columns: { id: true, slug: true, title: true, path: true, parentId: true, position: true },
    orderBy: (n, { asc }) => [asc(n.position), asc(n.path)],
  });

  /*
   * Top level only, and never the home page or the legal ones.
   *
   * The home page is the logo's job — a «Inicio» link next to a clickable logo is a duplicate —
   * and the legal pages belong in the footer, which is where the other fix puts them.
   */
  const candidates = pages.filter(
    (page) => !page.parentId && page.path !== "/" && !LEGAL_SLUGS.includes(page.slug)
  );

  if (candidates.length === 0) {
    return {
      message: "No hay páginas publicadas de primer nivel con las que construir el menú.",
      noop: true,
    };
  }

  const row = await context.db.query.settings.findFirst({
    where: eq(settings.siteId, context.siteId),
    columns: { menus: true },
  });
  const current = readMenu(row?.menus, "main");
  if (current.length > 0) {
    return { message: "La cabecera ya tenía menú. No se ha tocado.", noop: true };
  }

  const items: MenuItem[] = candidates.map((page) => ({ label: page.title, nodeId: page.id }));
  const menus = normalizeMenus({ ...((row?.menus ?? {}) as object), main: items });

  await context.db.update(settings).set({ menus }).where(eq(settings.siteId, context.siteId));
  await invalidateSettings(context.cache, context.siteId);

  return {
    message: `Menú creado con ${items.length} enlace(s): ${items.map((i) => i.label).join(", ")}.`,
    changed: items.map((i) => i.label),
  };
}

async function fixContactForm(context: FixContext): Promise<FixResult> {
  const { type, sectionsKey } = await pageType(context);
  const contactDef = getSection("contact");
  if (!contactDef) throw new ActionError({ code: "BAD_REQUEST", message: "Falta la sección de contacto." });

  const block = {
    id: generateId("sec"),
    type: "contact",
    v: contactDef.version,
    data: {
      ...(contactDef.defaults ?? {}),
      fields: DEFAULT_CONTACT_FIELDS.map((field) => ({ ...field })),
    },
  };

  const existing = await context.db.query.nodes.findFirst({
    where: and(eq(nodes.siteId, context.siteId), eq(nodes.slug, "contacto"), isNull(nodes.deletedAt)),
  });

  if (!existing) {
    const id = generateId("node");
    const now = new Date();
    await context.db.insert(nodes).values({
      id,
      siteId: context.siteId,
      contentTypeId: type.id,
      parentId: null,
      locale: context.defaultLocale,
      slug: "contacto",
      path: computePath(null, "contacto", context.defaultLocale, context.defaultLocale),
      position: 50,
      status: "published",
      publishedAt: now,
      title: "Contacto",
      fields: { [sectionsKey]: [block] },
      seo: {},
      createdBy: context.userId,
      createdVia: "web",
      createdAt: now,
      updatedAt: now,
    });
    await invalidateNode(context.cache, { siteId: context.siteId, nodeId: id, contentTypeId: type.id });
    return { message: "Creada la página /contacto con un formulario.", changed: ["/contacto"] };
  }

  const fields = { ...((existing.fields ?? {}) as Record<string, unknown>) };
  const blocks = Array.isArray(fields[sectionsKey]) ? (fields[sectionsKey] as unknown[]) : [];
  if (blocks.some((b) => (b as { type?: string })?.type === "contact")) {
    return { message: "La página /contacto ya tenía un formulario.", noop: true };
  }

  fields[sectionsKey] = [...blocks, block];
  const updates: Record<string, unknown> = { fields, updatedAt: new Date() };
  if (existing.status !== "published") {
    updates.status = "published";
    updates.publishedAt = new Date();
  }

  await context.db
    .update(nodes)
    .set(updates)
    .where(and(eq(nodes.id, existing.id), eq(nodes.siteId, context.siteId)));
  await invalidateNode(context.cache, {
    siteId: context.siteId,
    nodeId: existing.id,
    contentTypeId: type.id,
  });

  return { message: "Formulario añadido a /contacto.", changed: ["/contacto"] };
}

async function fixImageDimensions(context: FixContext): Promise<FixResult> {
  const rows = await context.db.query.media.findMany({
    where: and(eq(media.siteId, context.siteId), eq(media.type, "image")),
    columns: { id: true, url: true, width: true },
  });
  const pending = rows.filter((row) => !row.width);

  if (pending.length === 0) {
    return { message: "Todas las imágenes ya tienen dimensiones.", noop: true };
  }

  let done = 0;
  const failed: string[] = [];

  for (const row of pending) {
    try {
      const response = await fetch(row.url);
      if (!response.ok) throw new Error(String(response.status));
      const bytes = new Uint8Array(await response.arrayBuffer());
      const meta = await imageMetadata(bytes);
      if (!meta?.width || !meta?.height) throw new Error("sin cabecera legible");

      const rotated = typeof meta.orientation === "number" && meta.orientation >= 5;
      await context.db
        .update(media)
        .set(
          rotated
            ? { width: meta.height, height: meta.width }
            : { width: meta.width, height: meta.height }
        )
        .where(eq(media.id, row.id));
      done++;
    } catch {
      // An image whose URL no longer resolves is reported, not retried: the useful information
      // is which ones, so somebody can look.
      failed.push(row.id);
    }
  }

  return {
    message: failed.length
      ? `Leídas ${done} de ${pending.length}. No se pudo con ${failed.length}: revisa que sus URL sigan respondiendo.`
      : `Leídas las dimensiones de ${done} imagen(es).`,
    changed: [`${done} imágenes`],
  };
}

const HANDLERS: Record<string, (context: FixContext) => Promise<FixResult>> = {
  legal: fixLegalPages,
  "legal-menu": fixLegalMenu,
  menu: fixMainMenu,
  "contact-form": fixContactForm,
  dimensions: fixImageDimensions,
};

export const fixActions = {
  apply: defineAction({
    input: z.object({ checkId: z.string() }),
    handler: async (input, context) => {
      if (!context.locals.user) {
        throw new ActionError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      }
      const siteId = context.locals.siteId;

      /*
       * Admin, not any role.
       *
       * These create published pages and rewrite site navigation from a single click. That is a
       * reasonable thing for whoever is setting the site up and not something a collaborator
       * should be able to trigger by exploring the dashboard.
       */
      await requireAdmin(context.locals.db, context.locals.user.id, siteId);

      if (!isAutomatic(input.checkId)) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `«${input.checkId}» no tiene arreglo automático. Los que sí: ${AUTOMATIC_FIX_IDS.join(", ")}.`,
        });
      }

      const handler = HANDLERS[input.checkId];
      if (!handler) {
        // The descriptor says automatic but nothing implements it. A declaration and an
        // implementation that disagree, which is exactly what a test should catch — and does.
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: `«${input.checkId}» está declarado como automático pero no tiene implementación.`,
        });
      }

      const result = await handler({
        db: context.locals.db,
        siteId,
        userId: context.locals.user.id,
        defaultLocale: context.locals.site?.defaultLocale ?? "es",
        cache: context.cache,
      });

      return result;
    },
  }),
};

/** Exported for the test that asserts the catalogue and the handlers agree. */
export const IMPLEMENTED_FIX_IDS = Object.keys(HANDLERS);
