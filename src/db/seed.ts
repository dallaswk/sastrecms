import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

import { DEFAULT_SITE_ID as SITE_ID } from "../lib/site";
import { rolesForSite, roleId } from "../lib/roles";

async function seed() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) throw new Error("TURSO_DATABASE_URL is required");

  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema });

  console.log("🌱 Seeding database...");

  // 1. Default site
  await db
    .insert(schema.sites)
    .values({
      id: SITE_ID,
      name: "My Site",
      defaultLocale: "es",
      locales: ["es"],
    })
    .onConflictDoNothing();
  console.log("  ✓ site");

  // 2. System content types
  //
  // Every renderer under src/components/renderers/ paints `fields.body`, so each base type
  // must declare it — otherwise the editor offers nothing but title/slug/SEO and the page
  // renders empty. Custom types add their own fields from the content type builder.
  const bodyField = {
    key: "body",
    label: "Contenido",
    type: "richtext" as const,
  };

  const systemTypes = [
    {
      id: "ct_page",
      siteId: SITE_ID,
      key: "page",
      label: "Página",
      icon: "file",
      hasArchive: false,
      supportsChildren: true,
      translatable: true,
      isSystem: true,
      fieldSchema: [bodyField] as schema.FieldDefinition[],
    },
    {
      id: "ct_post",
      siteId: SITE_ID,
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
        bodyField,
      ] as schema.FieldDefinition[],
    },
    {
      id: "ct_portfolio_item",
      siteId: SITE_ID,
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
        bodyField,
      ] as schema.FieldDefinition[],
    },
  ];

  for (const ct of systemTypes) {
    await db.insert(schema.contentTypes).values(ct).onConflictDoNothing();
  }
  console.log("  ✓ system content types (page, post, portfolio_item)");

  // 3. Default roles
  const roles = [
    ...rolesForSite(SITE_ID),
  ];

  for (const role of roles) {
    await db.insert(schema.roles).values(role).onConflictDoNothing();
  }
  console.log("  ✓ roles (admin, editor, collaborator)");

  // 4. Admin role: wildcard permissions (contentTypeId null = all types)
  await db
    .insert(schema.roleContentPermissions)
    .values({
      id: "perm_admin_wildcard",
      roleId: roleId(SITE_ID, "admin"),
      contentTypeId: null,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canPublish: true,
    })
    .onConflictDoNothing();
  console.log("  ✓ admin wildcard permissions");

  // 5. Default site settings
  await db
    .insert(schema.settings)
    .values({
      siteId: SITE_ID,
      siteName: "My Site",
      tagline: "",
      theme: {},
      socialLinks: {},
      analyticsIds: {},
    })
    .onConflictDoNothing();
  console.log("  ✓ settings");

  console.log("\n✅ Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
