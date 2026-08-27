/**
 * Site navigation.
 *
 * An item points at a node or at a raw URL, never both. Storing the node id rather than
 * its path is what makes a menu survive a slug rename: the path is resolved at render
 * time from the id. The cost is one extra query per public page, paid only when a menu
 * actually references nodes.
 */
export type MenuItem = {
  label: string;
  /** Internal target. Wins over `url` if both are somehow set. */
  nodeId?: string;
  /** External link, mailto:, tel:, or an in-page anchor. */
  url?: string;
};

export type MenuKey = "main" | "footer" | "legal";

export type SiteMenus = Partial<Record<MenuKey, MenuItem[]>>;

export const MENU_KEYS: MenuKey[] = ["main", "footer", "legal"];

export const MENU_LABELS: Record<MenuKey, string> = {
  main: "Menú principal",
  footer: "Enlaces del pie",
  legal: "Enlaces legales",
};

/** A menu item with its destination worked out, ready to render. */
export type ResolvedItem = { label: string; href: string; external: boolean };

/** Whatever is stored, read as a menu: a missing key or a stray value is not a crash. */
export function readMenu(menus: unknown, key: MenuKey): MenuItem[] {
  if (!menus || typeof menus !== "object") return [];
  const raw = (menus as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is MenuItem => !!i && typeof i === "object" && typeof (i as MenuItem).label === "string")
    .filter((i) => i.label.trim() !== "");
}

/** Every node id any menu points at, for a single lookup. */
export function referencedNodeIds(menus: unknown): string[] {
  const ids = new Set<string>();
  for (const key of MENU_KEYS) {
    for (const item of readMenu(menus, key)) {
      if (item.nodeId) ids.add(item.nodeId);
    }
  }
  return [...ids];
}

const EXTERNAL = /^(https?:|mailto:|tel:)/i;

/**
 * Turns stored items into links.
 *
 * An item whose node no longer exists is dropped rather than rendered as a dead link:
 * deleting a page should not leave the menu pointing at a 404 on every page of the site.
 */
export function resolveMenu(
  menus: unknown,
  key: MenuKey,
  paths: Map<string, string>
): ResolvedItem[] {
  const out: ResolvedItem[] = [];

  for (const item of readMenu(menus, key)) {
    if (item.nodeId) {
      const href = paths.get(item.nodeId);
      if (href) out.push({ label: item.label, href, external: false });
      continue;
    }
    const url = item.url?.trim();
    if (!url) continue;
    out.push({ label: item.label, href: url, external: EXTERNAL.test(url) });
  }

  return out;
}

/** True when the link points at the page being rendered, for aria-current. */
export function isCurrent(href: string, pathname: string): boolean {
  if (href.startsWith("#") || EXTERNAL.test(href)) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
