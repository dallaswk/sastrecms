import { getSection } from "@lib/sections/registry";
import type { PresetMenus, PresetSection, SitePreset } from "./types";
import type { MenuItem, SiteMenus } from "@lib/menus";
import type { SectionInstance } from "@lib/sections/types";

/**
 * Turning a preset's slug references into node ids.
 *
 * Kept pure and separate from the database work so the substitution — the part that
 * silently produces a broken site when it goes wrong — is testable without a connection.
 */

/**
 * Rewrites the `relation` fields of a section's data from preset slugs to node ids.
 *
 * Which fields are references comes from the section definition, so a section added later
 * with its own relation field works without touching this.
 */
export function resolveSectionRefs(
  section: PresetSection,
  idsBySlug: Map<string, string>
): PresetSection {
  const def = getSection(section.type);
  if (!def) return section;

  const relationKeys = def.fields.filter((f) => f.type === "relation").map((f) => f.key);
  if (relationKeys.length === 0) return section;

  const data = { ...section.data };
  for (const key of relationKeys) {
    const slug = data[key];
    if (typeof slug !== "string" || !slug) continue;
    // An unresolved slug becomes empty rather than staying a slug: a relation field
    // holding "trabajos" would look like a node id and quietly find nothing.
    data[key] = idsBySlug.get(slug) ?? "";
  }

  return { ...section, data };
}

/** Stamps ids and the registry's current version onto a preset's sections. */
export function buildSections(
  sections: PresetSection[] | undefined,
  idsBySlug: Map<string, string>,
  makeId: () => string
): SectionInstance[] {
  return (sections ?? []).map((raw) => {
    const section = resolveSectionRefs(raw, idsBySlug);
    return {
      id: makeId(),
      type: section.type,
      v: getSection(section.type)?.version ?? 1,
      data: section.data,
      ...(section.anchor ? { anchor: section.anchor } : {}),
    };
  });
}

/** Turns preset menus, which reference slugs, into the stored shape, which holds ids. */
export function buildMenus(menus: PresetMenus, idsBySlug: Map<string, string>): SiteMenus {
  const out: SiteMenus = {};

  for (const [key, items] of Object.entries(menus) as [keyof SiteMenus, PresetMenus[keyof SiteMenus]][]) {
    const resolved: MenuItem[] = [];

    for (const item of items ?? []) {
      if (item.slug) {
        const nodeId = idsBySlug.get(item.slug);
        // Dropped rather than kept as a dead entry: the preset declared a page it did not
        // create, which is a bug in the preset, not something to render on every page.
        if (nodeId) resolved.push({ label: item.label, nodeId });
        continue;
      }
      if (item.url) resolved.push({ label: item.label, url: item.url });
    }

    if (resolved.length) out[key] = resolved;
  }

  return out;
}

/**
 * The order pages must be created in: parents before children, because a child's path is
 * built from its parent's.
 */
export function orderedPages(preset: SitePreset): SitePreset["pages"] {
  const bySlug = new Map(preset.pages.map((p) => [p.slug, p]));
  const out: SitePreset["pages"] = [];
  const done = new Set<string>();

  const visit = (slug: string, seen: Set<string>) => {
    if (done.has(slug) || seen.has(slug)) return;
    const page = bySlug.get(slug);
    if (!page) return;
    seen.add(slug);
    if (page.parentSlug) visit(page.parentSlug, seen);
    done.add(slug);
    out.push(page);
  };

  for (const page of preset.pages) visit(page.slug, new Set());
  return out;
}
