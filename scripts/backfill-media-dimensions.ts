#!/usr/bin/env node
/**
 * Fills in width and height for media uploaded before the upload started recording them.
 *
 * Reads the bytes over the public URL rather than through the R2 binding, because a script
 * run from a terminal has no bindings — and it is the same bytes either way.
 *
 * Safe to re-run: it only touches rows where both dimensions are missing.
 */
import { imageMetadata } from "astro/assets/utils";
import { and, eq, isNull } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { media } from "../src/db/schema";

const C = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", dim: "\x1b[2m", yellow: "\x1b[33m" };

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error(`${C.red}Error:${C.reset} TURSO_DATABASE_URL is not set`);
    process.exit(1);
  }

  const db = createDb(url, process.env.TURSO_AUTH_TOKEN);

  const rows = await db.query.media.findMany({
    where: and(eq(media.type, "image"), isNull(media.width)),
    columns: { id: true, url: true, altText: true },
  });

  if (rows.length === 0) {
    console.log(`${C.green}✓${C.reset} Nothing to backfill: every image already has dimensions.`);
    process.exit(0);
  }

  console.log(`${rows.length} image(s) without dimensions${DRY_RUN ? `${C.dim} (dry run)${C.reset}` : ""}\n`);

  let done = 0;
  let failed = 0;
  let missingAlt = 0;

  for (const row of rows) {
    if (!row.altText) missingAlt++;
    try {
      const response = await fetch(row.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const bytes = new Uint8Array(await response.arrayBuffer());
      const meta = await imageMetadata(bytes);
      if (!meta?.width || !meta?.height) throw new Error("no readable dimensions");

      const rotated = typeof meta.orientation === "number" && meta.orientation >= 5;
      const width = rotated ? meta.height : meta.width;
      const height = rotated ? meta.width : meta.height;

      if (!DRY_RUN) {
        await db.update(media).set({ width, height }).where(eq(media.id, row.id));
      }
      console.log(`  ${C.green}✓${C.reset} ${row.id} ${C.dim}${width}×${height}${C.reset}`);
      done++;
    } catch (error) {
      console.log(
        `  ${C.red}✗${C.reset} ${row.id} ${C.dim}${error instanceof Error ? error.message : error}${C.reset}`
      );
      failed++;
    }
  }

  console.log(`\n${C.green}${done}${C.reset} updated, ${failed ? C.red : ""}${failed}${C.reset} failed.`);
  if (missingAlt > 0) {
    // Worth saying out loud: dimensions fix the layout shift, but an image with no alt text
    // is still unlabelled for a screen reader and invisible to image search.
    console.log(
      `${C.yellow}!${C.reset} ${missingAlt} of them also have no alt text. Add it in Medios.`
    );
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`${C.red}✗${C.reset} Backfill failed:`, err);
  process.exit(1);
});
