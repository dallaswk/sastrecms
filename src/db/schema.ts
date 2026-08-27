import { sql, relations } from "drizzle-orm";
import {
  text,
  integer,
  sqliteTable,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// sites — mono-tenant today, ready for SaaS multi-tenant tomorrow
// ---------------------------------------------------------------------------
export const sites = sqliteTable("sites", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  defaultLocale: text("default_locale").notNull().default("es"),
  locales: text("locales", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default(sql`'["es"]'`),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// content_types — the "ACF" of the system, editable by Admin
// ---------------------------------------------------------------------------
export const contentTypes = sqliteTable(
  "content_types",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    icon: text("icon"),
    hasArchive: integer("has_archive", { mode: "boolean" })
      .notNull()
      .default(false),
    supportsChildren: integer("supports_children", { mode: "boolean" })
      .notNull()
      .default(false),
    translatable: integer("translatable", { mode: "boolean" })
      .notNull()
      .default(true),
    isSystem: integer("is_system", { mode: "boolean" })
      .notNull()
      .default(false),
    fieldSchema: text("field_schema", { mode: "json" })
      .notNull()
      .$type<FieldDefinition[]>()
      .default(sql`'[]'`),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("content_types_site_key_idx").on(t.siteId, t.key)]
);

// The field vocabulary lives in @lib/fields/types, which is plain TypeScript so the Vue
// islands and the tests can import it too. Re-exported here because this module is what
// the rest of the codebase already imports these names from.
export { FIELD_TYPES, FIELD_TYPE_LABELS } from "../lib/fields/types";
export type { FieldType, FieldDefinition } from "../lib/fields/types";
// Also imported, not just re-exported: the table definition below uses it as a type.
import type { FieldDefinition } from "../lib/fields/types";

// ---------------------------------------------------------------------------
// nodes — the unified content tree
// ---------------------------------------------------------------------------
export const nodes = sqliteTable(
  "nodes",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    contentTypeId: text("content_type_id")
      .notNull()
      .references(() => contentTypes.id),
    parentId: text("parent_id"),
    locale: text("locale").notNull().default("es"),
    translationGroupId: text("translation_group_id"),
    slug: text("slug").notNull(),
    path: text("path").notNull(),
    position: integer("position").notNull().default(0),
    status: text("status", { enum: ["draft", "published", "scheduled"] })
      .notNull()
      .default("draft"),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    /**
     * When a scheduled node becomes visible.
     *
     * No cron involved: the public query accepts `scheduled AND publish_at <= now`, so the page
     * appears on the first request after the moment passes. That is also why the cache TTL of a
     * listing shortens as its next scheduled child approaches — nothing writes at that instant,
     * so nothing would purge.
     */
    publishAt: integer("publish_at", { mode: "timestamp" }),
    /**
     * Soft delete. Non-null means the node is in the trash.
     *
     * Every read has to filter on this, which is the risk: one query that forgets and deleted
     * content is still live. `visibleNodes()` and `activeNodes()` in lib/publishing exist so
     * there is one definition of the filter rather than nine.
     */
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
    title: text("title").notNull(),
    fields: text("fields", { mode: "json" })
      .notNull()
      .$type<Record<string, unknown>>()
      .default(sql`'{}'`),
    seo: text("seo", { mode: "json" })
      .$type<NodeSeo>()
      .default(sql`'{}'`),
    createdBy: text("created_by").references(() => users.id),
    createdVia: text("created_via", { enum: ["web", "mcp"] })
      .notNull()
      .default("web"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("nodes_site_path_idx").on(t.siteId, t.path),
    index("nodes_parent_idx").on(t.parentId),
    index("nodes_status_idx").on(t.status),
    // The public query filters on both of these on every request.
    index("nodes_visibility_idx").on(t.siteId, t.status, t.publishAt),
    index("nodes_deleted_idx").on(t.siteId, t.deletedAt),
  ]
);

export type NodeSeo = {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  noindex?: boolean;
  canonical?: string;
};

// ---------------------------------------------------------------------------
// media
// ---------------------------------------------------------------------------
export const mediaFolders = sqliteTable("media_folders", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["image", "video", "pdf", "doc"] }).notNull(),
    storageKey: text("storage_key").notNull(),
    url: text("url").notNull(),
    altText: text("alt_text"),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes"),
    folderId: text("folder_id").references(() => mediaFolders.id),
    uploadedBy: text("uploaded_by").references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("media_site_idx").on(t.siteId)]
);

// ---------------------------------------------------------------------------
// roles & permissions
// ---------------------------------------------------------------------------
export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  key: text("key", { enum: ["admin", "editor", "collaborator"] }).notNull(),
  label: text("label").notNull(),
});

export const roleContentPermissions = sqliteTable(
  "role_content_permissions",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    contentTypeId: text("content_type_id").references(() => contentTypes.id),
    canView: integer("can_view", { mode: "boolean" }).notNull().default(false),
    canCreate: integer("can_create", { mode: "boolean" })
      .notNull()
      .default(false),
    canEdit: integer("can_edit", { mode: "boolean" }).notNull().default(false),
    canDelete: integer("can_delete", { mode: "boolean" })
      .notNull()
      .default(false),
    canPublish: integer("can_publish", { mode: "boolean" })
      .notNull()
      .default(false),
  }
);

// ---------------------------------------------------------------------------
// user_roles — assign a site role to a user
// ---------------------------------------------------------------------------
export const userRoles = sqliteTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    assignedAt: integer("assigned_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.siteId] }) })
);

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------
export const settings = sqliteTable("settings", {
  siteId: text("site_id")
    .primaryKey()
    .references(() => sites.id, { onDelete: "cascade" }),
  siteName: text("site_name").notNull(),
  tagline: text("tagline"),
  logoMediaId: text("logo_media_id").references(() => media.id),
  theme: text("theme", { mode: "json" })
    .$type<SiteTheme>()
    .default(sql`'{}'`),
  contactEmail: text("contact_email"),
  socialLinks: text("social_links", { mode: "json" })
    .$type<Record<string, string>>()
    .default(sql`'{}'`),
  analyticsIds: text("analytics_ids", { mode: "json" })
    .$type<Record<string, string>>()
    .default(sql`'{}'`),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  /**
   * Navigation, as JSON rather than tables. Same call as `theme` and `socialLinks`: a
   * menu is read on every public page, and a menus + menu_items pair would add a join to
   * the hottest path in the app to model a handful of rows that are always fetched
   * together and always rewritten as a whole.
   */
  menus: text("menus", { mode: "json" })
    .$type<SiteMenus>()
    .default(sql`'{}'`),
  redirects: text("redirects", { mode: "json" })
    .$type<{ from: string; to: string; permanent: boolean }[]>()
    .default(sql`'[]'`),
  integrations: text("integrations", { mode: "json" })
    .$type<Record<string, string>>()
    .default(sql`'{}'`),
  /**
   * The identity behind the site.
   *
   * Required by Spanish law (LSSI-CE art. 10) on the legal notice of every commercial site,
   * and it is the input the privacy policy and the legal notice are generated from — a site
   * cannot be delivered without it, and it is the same handful of fields every time.
   */
  business: text("business", { mode: "json" })
    .$type<Record<string, string>>()
    .default(sql`'{}'`),
});

export type { MenuItem, SiteMenus } from "../lib/menus";
import type { SiteMenus } from "../lib/menus";

export type SiteTheme = {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  baseColor?: string;
  borderRadius?: string;
  fontHeading?: string;
  fontBody?: string;
  daisyuiTheme?: string;
};

// ---------------------------------------------------------------------------
// api_tokens — for MCP access
// ---------------------------------------------------------------------------
export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
});

// ---------------------------------------------------------------------------
// Better Auth managed tables
// ---------------------------------------------------------------------------
export const users = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  // Our own flag, not Better Auth's. `emailVerified: false` does not block sign-in
  // while emailAndPassword runs without requireEmailVerification, so deactivating a
  // user needs a field the middleware actually enforces.
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const verifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// Relations (declared after all tables)
// ---------------------------------------------------------------------------
export const nodesRelations = relations(nodes, ({ one }) => ({
  contentType: one(contentTypes, {
    fields: [nodes.contentTypeId],
    references: [contentTypes.id],
  }),
  parent: one(nodes, {
    fields: [nodes.parentId],
    references: [nodes.id],
    relationName: "parent_child",
  }),
  createdByUser: one(users, {
    fields: [nodes.createdBy],
    references: [users.id],
  }),
}));

export const contentTypesRelations = relations(contentTypes, ({ many }) => ({
  nodes: many(nodes),
}));

export const sitesRelations = relations(sites, ({ many }) => ({
  nodes: many(nodes),
  contentTypes: many(contentTypes),
  roles: many(roles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(roleContentPermissions),
}));

export const roleContentPermissionsRelations = relations(
  roleContentPermissions,
  ({ one }) => ({
    role: one(roles, {
      fields: [roleContentPermissions.roleId],
      references: [roles.id],
    }),
    contentType: one(contentTypes, {
      fields: [roleContentPermissions.contentTypeId],
      references: [contentTypes.id],
    }),
  })
);

export const mediaRelations = relations(media, ({ one }) => ({
  folder: one(mediaFolders, {
    fields: [media.folderId],
    references: [mediaFolders.id],
  }),
  uploadedByUser: one(users, {
    fields: [media.uploadedBy],
    references: [users.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
  site: one(sites, { fields: [userRoles.siteId], references: [sites.id] }),
}));

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  user: one(users, {
    fields: [apiTokens.userId],
    references: [users.id],
  }),
}));

/**
 * What a visitor sent through a contact form.
 *
 * The values are stored as JSON rather than columns because the fields are declared per
 * form, in the section's own configuration: a gestoría asks for a tax id, a taller asks
 * for a licence plate. The columns that exist are the ones the inbox lists and searches on.
 */
export const formSubmissions = sqliteTable(
  "form_submissions",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** The page it was sent from. Nulled rather than cascaded: deleting a page must not
     *  delete the leads that came through it. */
    nodeId: text("node_id").references(() => nodes.id, { onDelete: "set null" }),
    /** Section instance id, so several forms on one site stay apart in the inbox. */
    formId: text("form_id").notNull(),
    /** Human label for the form, copied at submission time — the section may be renamed. */
    formLabel: text("form_label"),
    values: text("values", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'`),
    /** Pulled out of `values` for the inbox list and for the reply-to on the notification. */
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    status: text("status", { enum: ["new", "read", "spam"] })
      .notNull()
      .default("new"),
    /**
     * SHA-256 of the IP with the app secret as salt, never the IP itself.
     *
     * It is all the rate limiter needs — the same address always hashes the same — and it
     * keeps the table from becoming a log of personal data that has to be justified,
     * disclosed and expired under the GDPR.
     */
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    /** The consent text as it read on screen, so what was agreed to can be shown later. */
    consentText: text("consent_text"),
    /** Whether the notification email went out, and why it did not. */
    notifiedAt: integer("notified_at", { mode: "timestamp" }),
    notifyError: text("notify_error"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("form_submissions_site_created_idx").on(t.siteId, t.createdAt),
    index("form_submissions_status_idx").on(t.siteId, t.status),
    // The rate limiter's query: count by hash within a window.
    index("form_submissions_rate_idx").on(t.ipHash, t.createdAt),
  ]
);


/**
 * A snapshot of a node, taken before it is overwritten.
 *
 * Written on every update rather than on demand: the moment somebody wants a previous version
 * is always *after* the change that lost it. Capped per node, because `fields` holds a whole
 * page of sections and an unbounded history would be the largest table in the database.
 *
 * Not a diff. A full copy is a few kilobytes and restoring it is one write; a diff chain saves
 * space and turns "restore this" into replaying every step since, which is where that design
 * goes wrong.
 */
export const nodeRevisions = sqliteTable(
  "node_revisions",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    /** Snapshot of the fields that can be restored. */
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    fields: text("fields", { mode: "json" })
      .notNull()
      .$type<Record<string, unknown>>()
      .default(sql`'{}'`),
    seo: text("seo", { mode: "json" }).$type<NodeSeo>().default(sql`'{}'`),
    status: text("status").notNull(),
    /** Who made the change this snapshot precedes, and how. */
    authorId: text("author_id").references(() => users.id),
    authorVia: text("author_via", { enum: ["web", "mcp"] }).notNull().default("web"),
    /** Short description of what changed, computed at write time. */
    summary: text("summary"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("node_revisions_node_idx").on(t.nodeId, t.createdAt)]
);
