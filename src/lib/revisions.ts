/**
 * Snapshots of a node, and what changed between them.
 *
 * The summary is computed at write time rather than diffed on read, because reading a revision
 * list means loading N copies of a whole page of sections just to say «cambió el titular». One
 * sentence per row, stored, is what makes the list usable.
 */

export const MAX_REVISIONS_PER_NODE = 20;

export type RevisionSnapshot = {
  title: string;
  slug: string;
  status: string;
  fields: Record<string, unknown>;
  seo: unknown;
};

/**
 * What changed, in one sentence.
 *
 * Deliberately coarse: naming every altered key would produce «cambió bloques» for any edit to
 * any section, which says nothing. Counting the blocks is what tells someone whether a revision
 * is the one they want to go back to.
 */
export function summariseChange(
  before: RevisionSnapshot,
  after: Partial<RevisionSnapshot>
): string {
  const parts: string[] = [];

  if (after.title !== undefined && after.title !== before.title) {
    parts.push(`título: «${before.title}» → «${after.title}»`);
  }
  if (after.slug !== undefined && after.slug !== before.slug) {
    parts.push(`slug: ${before.slug} → ${after.slug}`);
  }
  if (after.status !== undefined && after.status !== before.status) {
    parts.push(`estado: ${before.status} → ${after.status}`);
  }

  if (after.fields !== undefined) {
    const beforeBlocks = countBlocks(before.fields);
    const afterBlocks = countBlocks(after.fields);
    if (beforeBlocks !== afterBlocks) {
      parts.push(
        afterBlocks > beforeBlocks
          ? `+${afterBlocks - beforeBlocks} bloque(s)`
          : `−${beforeBlocks - afterBlocks} bloque(s)`
      );
    } else if (JSON.stringify(before.fields) !== JSON.stringify(after.fields)) {
      parts.push("contenido editado");
    }
  }

  if (after.seo !== undefined && JSON.stringify(before.seo) !== JSON.stringify(after.seo)) {
    parts.push("SEO");
  }

  return parts.length ? parts.join(" · ") : "sin cambios visibles";
}

/** Blocks across every sections field, whatever they are called. */
function countBlocks(fields: Record<string, unknown> | undefined): number {
  if (!fields) return 0;
  let total = 0;
  for (const value of Object.values(fields)) {
    if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && "type" in item)) {
      total += value.length;
    }
  }
  return total;
}

/**
 * Whether a change is worth a revision at all.
 *
 * Saving a form without touching anything is common — someone opens a page, looks, and hits
 * save. Twenty such saves would push every real revision out of a capped history, which is
 * exactly when someone needs it.
 */
export function isWorthSnapshotting(
  before: RevisionSnapshot,
  after: Partial<RevisionSnapshot>
): boolean {
  if (after.title !== undefined && after.title !== before.title) return true;
  if (after.slug !== undefined && after.slug !== before.slug) return true;
  if (after.status !== undefined && after.status !== before.status) return true;
  if (after.fields !== undefined && JSON.stringify(after.fields) !== JSON.stringify(before.fields)) return true;
  if (after.seo !== undefined && JSON.stringify(after.seo) !== JSON.stringify(before.seo)) return true;
  return false;
}

/** Which revision ids to drop once the cap is exceeded, oldest first. */
export function revisionsToPrune(ids: string[], max = MAX_REVISIONS_PER_NODE): string[] {
  return ids.length > max ? ids.slice(0, ids.length - max) : [];
}
