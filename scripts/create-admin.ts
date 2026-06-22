#!/usr/bin/env node
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { createDb } from "../src/db/client";
import { createAuth } from "../src/lib/auth";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const SITE_ID = "site_default";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npx tsx scripts/create-admin.ts <email> <password>");
    process.exit(1);
  }

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error("TURSO_DATABASE_URL is not set");
    process.exit(1);
  }

  const db = createDb(url, process.env.TURSO_AUTH_TOKEN);
  const auth = createAuth(db, "", "");

  // Sign up the user via Better Auth API
  const result = await (auth.api as any).signUpEmail({
    body: { email, password, name: email.split("@")[0] },
    asResponse: false,
  });

  if (!result?.user?.id) {
    console.error("Failed to create user:", result);
    process.exit(1);
  }

  const userId = result.user.id;

  // Assign admin role
  await db
    .insert(schema.userRoles)
    .values({
      userId,
      roleId: "role_admin",
      siteId: SITE_ID,
      assignedAt: new Date(),
    })
    .onConflictDoNothing();

  console.log(`✅ Admin user created: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Failed to create admin:", err);
  process.exit(1);
});
