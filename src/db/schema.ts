import { sql } from "drizzle-orm";
import {
  text,
  integer,
  sqliteTable,
  uniqueIndex,
  index,
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

export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "image"
  | "gallery"
  | "date"
  | "number"
  | "select"
  | "relation"
  | "repeater";

export type FieldDefinition = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  relatedContentType?: string;
  subfields?: FieldDefinition[];
};

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
});

export type SiteTheme = {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  borderRadius?: string;
  fontHeading?: string;
  fontBody?: string;
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
