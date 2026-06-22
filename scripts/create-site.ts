#!/usr/bin/env node
import { createInterface } from "node:readline";
import { exec, execSync } from "node:child_process";
import { promisify } from "node:util";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const execAsync = promisify(exec);
const SITE_ID = "site_default";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

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
  const answer = await ask(`${C.cyan}?${C.reset} ${question}${C.dim}${suffix}${C.reset} `);
  if (!answer) return defaultValue;
  return /^y(es)?$/i.test(answer);
}

function print(message: string) {
  console.log(message);
}

function step(number: number, title: string) {
  print(`\n${C.cyan}${C.bold}▶ ${number}.${C.reset} ${C.bold}${title}${C.reset}`);
}

function ok(message: string) {
  print(`  ${C.green}✓${C.reset} ${message}`);
}

function warn(message: string) {
  print(`  ${C.yellow}⚠${C.reset} ${message}`);
}

function fail(message: string) {
  print(`  ${C.red}✗${C.reset} ${message}`);
}

function info(message: string) {
  print(`  ${C.blue}ℹ${C.reset} ${message}`);
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

async function runCommand(command: string, cwd: string, env?: Record<string, string>): Promise<string> {
  const { stdout, stderr } = await execAsync(command, {
    cwd,
    env: { ...process.env, ...env },
  });
  if (stderr && !stdout) console.error(stderr);
  return stdout.trim();
}

async function main() {
  print("\n");
  print(`${C.cyan}${C.bold}╔══════════════════════════════════════════════════════╗${C.reset}`);
  print(`${C.cyan}${C.bold}║      🌐  sASTRe — New Site Wizard                     ║${C.reset}`);
  print(`${C.cyan}${C.bold}╚══════════════════════════════════════════════════════╝${C.reset}`);
  print(`${C.dim}This wizard will create a fresh sASTRe project in a new directory.${C.reset}\n`);

  // 1. Project name
  step(1, "Project name");
  const projectName = await ask(`${C.cyan}?${C.reset} Project name (e.g., my-blog): `);
  if (!projectName) {
    fail("Project name is required.");
    process.exit(1);
  }
  const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const targetDir = resolve(process.cwd(), `sastre-${safeName}`);

  if (existsSync(targetDir)) {
    const overwrite = await askYesNo(`Directory ${targetDir} already exists. Overwrite?`, false);
    if (!overwrite) {
      fail("Aborted.");
      process.exit(1);
    }
    rmSync(targetDir, { recursive: true, force: true });
  }

  // 2. Copy template
  step(2, "Copying project template");
  const sourceDir = resolve(__dirname, "..");
  const excluded = new Set(["node_modules", ".git", ".env", ".env.local", "dist", "package-lock.json"]);
  const excludedExt = new Set([".db", ".sqlite", ".sqlite3"]);

  cpSync(sourceDir, targetDir, {
    recursive: true,
    filter: (src) => {
      const name = src.split(/[\\/]/).pop() || "";
      if (excluded.has(name)) return false;
      if (excludedExt.has(name.split(".").pop() || "")) return false;
      return true;
    },
  });

  // Clean up any leftover env/db files inside the copy
  for (const file of readdirSync(targetDir)) {
    const ext = file.split(".").pop() || "";
    if (ext === "db" || ext === "sqlite" || ext === "sqlite3" || file.startsWith(".env")) {
      rmSync(join(targetDir, file), { recursive: true, force: true });
    }
  }

  ok(`Project copied to ${C.magenta}${targetDir}${C.reset}`);

  // 3. Update package.json name
  const packageJsonPath = join(targetDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.name = safeName;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
  ok("Updated package.json");

  // 4. Database choice
  step(3, "Database");
  const useTursoCloud = await askYesNo("Use Turso Cloud (requires turso CLI)?", false);

  let tursoUrl = "";
  let tursoToken = "";

  if (useTursoCloud) {
    const hasTurso = await checkCommand("turso");
    if (!hasTurso) {
      fail("turso CLI not found. Install it from https://docs.turso.dev/cli");
      process.exit(1);
    }

    const dbName = `sastre-${safeName}`;
    info("Creating Turso database...");
    try {
      await runCommand(`turso db create ${dbName}`, process.cwd());
      const showOutput = await runCommand(`turso db show ${dbName}`, process.cwd());
      const urlMatch = showOutput.match(/(libsql:\/\/[^\s]+)/);
      if (!urlMatch) {
        fail("Could not extract Turso URL from `turso db show` output.");
        process.exit(1);
      }
      tursoUrl = urlMatch[1];
      tursoToken = await runCommand(`turso db tokens create ${dbName}`, process.cwd());
      ok(`Turso database created: ${C.magenta}${dbName}${C.reset}`);
    } catch (err) {
      fail(`Turso setup failed: ${err}`);
      process.exit(1);
    }
  } else {
    const dbFileName = `sastre-${safeName}.db`;
    tursoUrl = `file:${dbFileName}`;
    ok(`Using local SQLite file: ${C.magenta}${dbFileName}${C.reset}`);
  }

  // 5. Secrets
  step(4, "Secrets");
  let betterAuthSecret = await ask(`${C.cyan}?${C.reset} BETTER_AUTH_SECRET (leave empty to generate): `);
  if (!betterAuthSecret) {
    betterAuthSecret = generateSecret();
    ok("Generated BETTER_AUTH_SECRET");
  }

  // 6. R2 / Media (optional)
  step(5, "Media storage (R2) — optional");
  const configureR2 = await askYesNo("Configure Cloudflare R2 for media uploads?", false);
  const r2Config: Record<string, string> = {};
  if (configureR2) {
    r2Config.R2_ACCOUNT_ID = await ask(`${C.cyan}?${C.reset} R2_ACCOUNT_ID: `);
    r2Config.R2_ACCESS_KEY_ID = await ask(`${C.cyan}?${C.reset} R2_ACCESS_KEY_ID: `);
    r2Config.R2_SECRET_ACCESS_KEY = await ask(`${C.cyan}?${C.reset} R2_SECRET_ACCESS_KEY: `);
    r2Config.R2_BUCKET_NAME = await ask(`${C.cyan}?${C.reset} R2_BUCKET_NAME: `);
    r2Config.R2_PUBLIC_URL = await ask(`${C.cyan}?${C.reset} R2_PUBLIC_URL (e.g., https://cdn.example.com): `);
  }

  // 7. Resend (optional)
  step(6, "Resend (magic link) — optional");
  const configureResend = await askYesNo("Configure Resend for magic link emails?", false);
  let resendApiKey = "";
  let resendFrom = "";
  if (configureResend) {
    resendApiKey = await ask(`${C.cyan}?${C.reset} Resend API key (re_...): `);
    resendFrom = await ask(`${C.cyan}?${C.reset} Resend from (e.g., Mi Sitio <noreply@example.com>): `);
  }

  // 8. Write .env in new project
  step(7, "Environment file");
  const envLines = [
    "# sASTRe environment",
    `TURSO_DATABASE_URL=${tursoUrl}`,
    tursoToken ? `TURSO_AUTH_TOKEN=${tursoToken}` : "# TURSO_AUTH_TOKEN=",
    `BETTER_AUTH_SECRET=${betterAuthSecret}`,
    ...Object.entries(r2Config).map(([k, v]) => `${k}=${v}`),
  ];
  writeFileSync(join(targetDir, ".env"), envLines.join("\n") + "\n");
  ok("Created .env");

  // 9. Install dependencies
  step(8, "Installing dependencies");
  try {
    await runCommand("npm install", targetDir);
    ok("Dependencies installed");
  } catch (err) {
    fail(`npm install failed: ${err}`);
    process.exit(1);
  }

  // 10. Apply migrations
  step(9, "Database migrations");
  try {
    await runCommand("npm run db:migrate", targetDir);
    ok("Migrations applied");
  } catch (err) {
    fail(`Migrations failed: ${err}`);
    process.exit(1);
  }

  // 11. Seed
  step(10, "Seed default data");
  try {
    await runCommand("npm run db:seed", targetDir);
    ok("Seed complete");
  } catch (err) {
    fail(`Seed failed: ${err}`);
    process.exit(1);
  }

  // 12. Update site name and Resend settings in DB
  step(11, "Site settings");
  const client = createClient({ url: tursoUrl, authToken: tursoToken || undefined });
  const db = drizzle(client, { schema });

  await db
    .update(schema.settings)
    .set({ siteName: projectName })
    .where(eq(schema.settings.siteId, SITE_ID));
  await db.update(schema.sites).set({ name: projectName }).where(eq(schema.sites.id, SITE_ID));
  ok("Updated site name in database");

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
    ok("Stored Resend configuration in database");
  }

  // 13. First admin user
  step(12, "First admin user — optional");
  const createAdmin = await askYesNo("Create the first admin user now?", true);
  if (createAdmin) {
    const adminEmail = await ask(`${C.cyan}?${C.reset} Admin email: `);
    const adminPassword = await ask(`${C.cyan}?${C.reset} Admin password: `);
    if (adminEmail && adminPassword) {
      try {
        await runCommand(`npx tsx scripts/create-admin.ts ${adminEmail} ${adminPassword}`, targetDir);
        ok(`Admin user ${C.magenta}${adminEmail}${C.reset} created`);
      } catch (err) {
        fail(`Admin creation failed: ${err}`);
      }
    }
  }

  // 14. Initial Git repo
  step(13, "Git repository");
  const initGit = await askYesNo("Initialize a new Git repository?", true);
  if (initGit) {
    try {
      await runCommand("git init", targetDir);
      await runCommand("git add .", targetDir);
      await runCommand('git commit -m "Initial commit from sASTRe wizard"', targetDir);
      ok("Git repository initialized");
    } catch (err) {
      warn(`Git init failed: ${err}`);
    }
  }

  // 15. Deploy?
  step(14, "Deploy");
  const deployNow = await askYesNo("Deploy to Cloudflare Pages now with wrangler?", false);
  if (deployNow) {
    try {
      await runCommand("npm run build", targetDir);
      ok("Build complete");
      await runCommand("npx wrangler pages deploy dist", targetDir);
      ok("Deployed to Cloudflare Pages");
    } catch (err) {
      fail(`Deploy failed: ${err}`);
    }
  }

  // Summary
  print("\n");
  print(`${C.green}${C.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  print(`${C.green}${C.bold}  ✅ sASTRe site created successfully${C.reset}`);
  print(`${C.green}${C.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  print(`${C.bold}Project:${C.reset}   ${C.magenta}${targetDir}${C.reset}`);
  print(`${C.bold}Site name:${C.reset} ${projectName}`);
  print(`${C.bold}Database:${C.reset}  ${tursoUrl}`);
  print(`${C.bold}Dev:${C.reset}       cd ${targetDir} && npm run dev`);
  print(`${C.bold}Admin:${C.reset}     http://localhost:4321/admin/login`);
  if (!deployNow) {
    print(`${C.bold}Deploy:${C.reset}    cd ${targetDir} && npx wrangler pages deploy dist`);
  }
  print(`${C.green}${C.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n`);

  rl.close();
}

main().catch((err) => {
  print(`${C.red}${C.bold}Unexpected error:${C.reset} ${err}`);
  process.exit(1);
});
