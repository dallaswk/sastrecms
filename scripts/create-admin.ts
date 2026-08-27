#!/usr/bin/env node
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { createDb } from "../src/db/client";
import { createAuth } from "../src/lib/auth";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

import { DEFAULT_SITE_ID as SITE_ID } from "../src/lib/site";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error(`${C.red}Usage:${C.reset} npx tsx scripts/create-admin.ts <email> <password>`);
    process.exit(1);
  }

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error(`${C.red}Error:${C.reset} TURSO_DATABASE_URL is not set`);
    process.exit(1);
  }

  const db = createDb(url, process.env.TURSO_AUTH_TOKEN);
  const auth = createAuth(db, "", "", {
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
  });

  const result = await (auth.api as any).signUpEmail({
    body: { email, password, name: email.split("@")[0] },
    asResponse: false,
  });

  if (!result?.user?.id) {
    console.error(`${C.red}Error:${C.reset} Failed to create user`, result);
    process.exit(1);
  }

  await db
    .insert(schema.userRoles)
    .values({
      userId: result.user.id,
      roleId: "role_admin",
      siteId: SITE_ID,
      assignedAt: new Date(),
    })
    .onConflictDoNothing();

  console.log(`${C.green}✓${C.reset} Admin user ${C.magenta}${email}${C.reset} created successfully`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`${C.red}✗${C.reset} Failed to create admin:`, err);
  process.exit(1);
});
