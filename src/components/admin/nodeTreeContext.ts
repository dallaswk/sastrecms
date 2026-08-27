import type { InjectionKey, Ref } from "vue";

export interface TreeNode {
  id: string;
  title: string;
  slug: string;
  path: string;
  status: string;
  position: number;
  parentId: string | null;
  contentTypeId: string;
  contentType?: { key: string; label: string; icon?: string };
  children: TreeNode[];
}

export interface ReorderItem {
  id: string;
  position: number;
  parentId: string | null;
}

/** Shared state every level of the recursive tree reads from the root instance. */
export interface NodeTreeContext {
  expanded: Ref<Set<string>>;
  deleting: Ref<string | null>;
  saving: Ref<boolean>;
  toggleExpand: (id: string) => void;
  deleteNode: (node: TreeNode) => Promise<void>;
  onDragEnd: () => Promise<void>;
  canEdit: (node: TreeNode) => boolean;
  canDelete: (node: TreeNode) => boolean;
}

export const NODE_TREE_KEY: InjectionKey<NodeTreeContext> = Symbol("nodeTree");

/** Every node gets a real children array so empty branches are still valid drop targets. */
export function normalize(raw: unknown): TreeNode[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => ({
    ...(n as TreeNode),
    parentId: (n as TreeNode).parentId ?? null,
    children: normalize((n as TreeNode).children),
  }));
}

export function parseNodes(raw: string): TreeNode[] {
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Flattens the tree into the {id, position, parentId} triples the reorder action expects. */
export function flatten(
  list: TreeNode[],
  parentId: string | null = null,
  out: ReorderItem[] = []
): ReorderItem[] {
  list.forEach((node, index) => {
    out.push({ id: node.id, position: index, parentId });
    flatten(node.children, node.id, out);
  });
  return out;
}

export function baselineOf(list: TreeNode[]): Map<string, ReorderItem> {
  return new Map(flatten(list).map((item) => [item.id, item]));
}

/**
 * Only the nodes whose parent or position actually moved. Sending the whole tree
 * would make the reorder action demand "edit" on every content type, so an editor
 * scoped to Posts could never reorder anything.
 */
export function diffAgainst(baseline: Map<string, ReorderItem>, list: TreeNode[]): ReorderItem[] {
  return flatten(list).filter((item) => {
    const before = baseline.get(item.id);
    return !before || before.parentId !== item.parentId || before.position !== item.position;
  });
}

/** Ids whose parent changed — the only nodes whose path the server rewrites. */
export function reparentedIds(
  baseline: Map<string, ReorderItem>,
  list: TreeNode[]
): Set<string> {
  const moved = new Set<string>();
  for (const item of flatten(list)) {
    const before = baseline.get(item.id);
    if (before && before.parentId !== item.parentId) moved.add(item.id);
  }
  return moved;
}

/**
 * Mirrors computePath() from @lib/id so the paths shown in the tree stay truthful
 * after a move — the reorder action only returns { ok: true }.
 *
 * Only reparented nodes and their descendants are rewritten, exactly like the action.
 * Recomputing everything would break the home node, which the wizard creates with
 * slug "index" but path "/" — a plain recompute would show it as "/index".
 */
export function recomputePaths(
  list: TreeNode[],
  parentPath: string,
  moved: Set<string>,
  inMovedSubtree = false
): void {
  for (const node of list) {
    const rewrite = inMovedSubtree || moved.has(node.id);
    if (rewrite) {
      node.path = parentPath ? `${parentPath}/${node.slug}` : `/${node.slug}`;
    }
    recomputePaths(node.children, node.path, moved, rewrite);
  }
}

export function clone(list: TreeNode[]): TreeNode[] {
  return JSON.parse(JSON.stringify(list)) as TreeNode[];
}
