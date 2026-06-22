#!/usr/bin/env node
import { createInterface } from "node:readline";
import { exec, execSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const execAsync = promisify(exec);
const SITE_ID = "site_default";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function askYesNo(question: string, defaultValue = true): Promise<boolean> {
  const suffix = defaultValue ? " [Y/n]" : " [y/N]";
  const answer = await ask(`${question}${suffix} `);
  if (!answer) return defaultValue;
  return /^y(es)?$/i.test(answer);
}

function step(title: string) {
  console.log(`\n▶ ${title}`);
}

function success(message: string) {
  console.log(`  ✓ ${message}`);
}

function error(message: string) {
  console.log(`  ✗ ${message}`);
}

function info(message: string) {
  console.log(`  ℹ ${message}`);
}

function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

async function checkCommand(cmd: string): Promise<boolean> {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command: string, env?: Record<string, string>): Promise<string> {
  const { stdout, stderr } = await execAsync(command, { env: { ...process.env, ...env } });
  if (stderr && !stdout) console.error(stderr);
  return stdout.trim();
}

async function main() {
  console.log("\n🌐 sASTRe — Create a new site\n");
  console.log("This wizard will guide you through creating a new sASTRe site.\n");

  // 1. Site name
  step("1. Site information");
  const siteName = await ask("Site name (e.g., My Blog): ");
  if (!siteName) {
    console.error("Site name is required.");
    process.exit(1);
  }
  const defaultDomain = siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const domain = await ask(`Site domain / slug [${defaultDomain}]: `) || defaultDomain;

  // 2. Database
  step("2. Database");
  const useTursoCloud = await askYesNo("Use Turso Cloud (requires turso CLI)?", false);

  let tursoUrl = "";
  let tursoToken = "";

  if (useTursoCloud) {
    const hasTurso = await checkCommand("turso");
    if (!hasTurso) {
      error("turso CLI not found. Install it from https://docs.turso.dev/cli");
      process.exit(1);
    }

    info("Creating Turso database...");
    const dbName = `sastre-${domain}`;
    try {
      const createOutput = await runCommand(`turso db create ${dbName}`);
      info(createOutput);

      const showOutput = await runCommand(`turso db show ${dbName}`);
      const urlMatch = showOutput.match(/(libsql:\/\/[^\s]+)/);
      if (!urlMatch) {
        error("Could not extract Turso URL from `turso db show` output.");
        process.exit(1);
      }
      tursoUrl = urlMatch[1];

      const tokenOutput = await runCommand(`turso db tokens create ${dbName}`);
      tursoToken = tokenOutput.trim();
      success(`Turso database created: ${dbName}`);
      success(`URL: ${tursoUrl}`);
    } catch (err) {
      error(`Turso setup failed: ${err}`);
      process.exit(1);
    }
  } else {
    const dbFileName = `sastre-${domain}.db`;
    tursoUrl = `file:${dbFileName}`;
    tursoToken = "";
    success(`Using local SQLite file: ${dbFileName}`);
  }

  // 3. Secrets
  step("3. Secrets");
  let betterAuthSecret = await ask("BETTER_AUTH_SECRET (leave empty to generate): ");
  if (!betterAuthSecret) {
    betterAuthSecret = generateSecret();
    success("Generated BETTER_AUTH_SECRET");
  }

  // 4. R2 / Media (optional)
  step("4. Media storage (R2) — optional");
  const configureR2 = await askYesNo("Configure Cloudflare R2 for media uploads?", false);
  let r2Config: Record<string, string> = {};
  if (configureR2) {
    r2Config = {
      R2_ACCOUNT_ID: await ask("R2_ACCOUNT_ID: "),
      R2_ACCESS_KEY_ID: await ask("R2_ACCESS_KEY_ID: "),
      R2_SECRET_ACCESS_KEY: await ask("R2_SECRET_ACCESS_KEY: "),
      R2_BUCKET_NAME: await ask("R2_BUCKET_NAME: "),
      R2_PUBLIC_URL: await ask("R2_PUBLIC_URL (e.g., https://cdn.example.com): "),
    };
  }

  // 5. Resend (optional)
  step("5. Resend (magic link) — optional");
  const configureResend = await askYesNo("Configure Resend for magic link emails?", false);
  let resendApiKey = "";
  let resendFrom = "";
  if (configureResend) {
    resendApiKey = await ask("Resend API key (re_...): ");
    resendFrom = await ask("Resend from address (e.g., Mi Sitio <noreply@example.com>): ");
  }

  // 6. Write .env
  step("6. Environment file");
  const envLines = [
    "# sASTRe environment",
    `TURSO_DATABASE_URL=${tursoUrl}`,
    tursoToken ? `TURSO_AUTH_TOKEN=${tursoToken}` : "# TURSO_AUTH_TOKEN=",
    `BETTER_AUTH_SECRET=${betterAuthSecret}`,
    ...Object.entries(r2Config).map(([k, v]) => `${k}=${v}`),
  ];

  if (existsSync(".env")) {
    const backup = `.env.backup-${Date.now()}`;
    writeFileSync(backup, readFileSync(".env", "utf8"));
    info(`Existing .env backed up to ${backup}`);
  }

  writeFileSync(".env", envLines.join("\n") + "\n");
  success("Created .env");

  // Load env into current process so child commands (migrate, seed, admin) inherit it
  process.env.TURSO_DATABASE_URL = tursoUrl;
  process.env.TURSO_AUTH_TOKEN = tursoToken || undefined;
  process.env.BETTER_AUTH_SECRET = betterAuthSecret;
  Object.entries(r2Config).forEach(([k, v]) => { process.env[k] = v; });

  // 7. Apply migrations
  step("7. Database migrations");
  try {
    await runCommand("npm run db:migrate");
    success("Migrations applied");
  } catch (err) {
    error(`Migrations failed: ${err}`);
    process.exit(1);
  }

  // 8. Seed
  step("8. Seed default data");
  try {
    await runCommand("npm run db:seed");
    success("Seed complete");
  } catch (err) {
    error(`Seed failed: ${err}`);
    process.exit(1);
  }

  // 9. Update site name and Resend settings in DB
  step("9. Site settings");
  const client = createClient({ url: tursoUrl, authToken: tursoToken || undefined });
  const db = drizzle(client, { schema });

  await db
    .update(schema.settings)
    .set({ siteName })
    .where(eq(schema.settings.siteId, SITE_ID));
  await db.update(schema.sites).set({ name: siteName }).where(eq(schema.sites.id, SITE_ID));
  success("Updated site name in database");

  if (resendApiKey || resendFrom) {
    await db
      .update(schema.settings)
      .set({
        integrations: {
          resendApiKey,
          resendFrom,
        },
      })
      .where(eq(schema.settings.siteId, SITE_ID));
    success("Stored Resend configuration in database");
  }

  // 10. Admin user (optional)
  step("10. First admin user — optional");
  const createAdmin = await askYesNo("Create the first admin user now?", true);
  if (createAdmin) {
    const adminEmail = await ask("Admin email: ");
    const adminPassword = await ask("Admin password: ");
    if (adminEmail && adminPassword) {
      try {
        await runCommand(`npx tsx scripts/create-admin.ts ${adminEmail} ${adminPassword}`);
        success(`Admin user ${adminEmail} created`);
      } catch (err) {
        error(`Admin creation failed: ${err}`);
      }
    }
  }

  // 11. Deploy?
  step("11. Deploy");
  const deployNow = await askYesNo("Deploy to Cloudflare Pages now with wrangler?", false);
  if (deployNow) {
    try {
      await runCommand("npm run build");
      success("Build complete");
      await runCommand("npx wrangler pages deploy dist");
      success("Deployed to Cloudflare Pages");
    } catch (err) {
      error(`Deploy failed: ${err}`);
    }
  }

  // Summary
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ sASTRe site created successfully");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Site name: ${siteName}`);
  console.log(`Database:  ${tursoUrl}`);
  console.log(`Local dev: npm run dev`);
  console.log(`Admin:     /admin/login`);
  if (configureResend) {
    console.log(`Magic link: configured`);
  }
  if (!deployNow) {
    console.log("Deploy:    npx wrangler pages deploy dist");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  rl.close();
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
