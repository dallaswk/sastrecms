<template>
  <div class="flex flex-col gap-1">
    <NodeTreeLevel :items="tree" :depth="0" />

    <p v-if="saving" class="text-xs text-base-content/50 px-2 pt-1">Guardando orden…</p>
    <p v-if="errorMsg" class="text-error text-xs px-2 pt-1">{{ errorMsg }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, provide, watch, nextTick } from "vue";
import { actions } from "astro:actions";
import NodeTreeLevel from "./NodeTreeLevel.vue";
import {
  NODE_TREE_KEY,
  baselineOf,
  clone,
  diffAgainst,
  parseNodes,
  recomputePaths,
  reparentedIds,
  type NodeTreeContext,
  type TreeNode,
} from "./nodeTreeContext";

const props = defineProps<{
  nodes: string;
  /** content type ids the current user may edit / delete; omitted means "everything" (admin). */
  editableTypes?: string | null;
  deletableTypes?: string | null;
  /** Needed to mirror computePath: only non-default locales carry a path prefix. */
  defaultLocale?: string;
}>();

function parseTypeList(raw: string | null | undefined): Set<string> | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as string[]) : null;
  } catch {
    return null;
  }
}

const editable = parseTypeList(props.editableTypes);
const deletable = parseTypeList(props.deletableTypes);

const tree = ref<TreeNode[]>(parseNodes(props.nodes));
const expanded = ref<Set<string>>(new Set(tree.value.map((n) => n.id)));
const deleting = ref<string | null>(null);
const saving = ref(false);
const errorMsg = ref("");

/** Last state confirmed by the server — used to revert an optimistic move that failed. */
let lastGood = clone(tree.value);
let baseline = baselineOf(tree.value);

watch(
  () => props.nodes,
  (value) => {
    tree.value = parseNodes(value);
    lastGood = clone(tree.value);
    baseline = baselineOf(tree.value);
  }
);

function toggleExpand(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function canEdit(node: TreeNode) {
  return editable === null || editable.has(node.contentTypeId);
}

function canDelete(node: TreeNode) {
  return deletable === null || deletable.has(node.contentTypeId);
}

function commit(moved: Set<string> = new Set()) {
  recomputePaths(tree.value, "", moved, props.defaultLocale ?? "es");
  lastGood = clone(tree.value);
  baseline = baselineOf(tree.value);
}

async function onDragEnd() {
  // Let vue-draggable-plus finish applying its model updates for both lists first.
  await nextTick();

  const items = diffAgainst(baseline, tree.value);
  if (items.length === 0) return;

  // Capture this before commit() resets the baseline it is derived from.
  const moved = reparentedIds(baseline, tree.value);

  saving.value = true;
  errorMsg.value = "";
  const { error } = await actions.nodes.reorder({ items });
  saving.value = false;

  if (error) {
    errorMsg.value = error.message;
    tree.value = clone(lastGood);
  } else {
    commit(moved);
  }
}

function removeById(list: TreeNode[], id: string): boolean {
  const index = list.findIndex((n) => n.id === id);
  if (index !== -1) {
    list.splice(index, 1);
    return true;
  }
  return list.some((n) => removeById(n.children, id));
}

async function deleteNode(node: TreeNode) {
  // The delete action refuses nodes with children; surface that before the round trip.
  if (node.children.length > 0) {
    errorMsg.value = `"${node.title}" tiene contenido dentro. Mueve o borra sus hijos primero.`;
    return;
  }
  if (!confirm(`¿Borrar "${node.title}"? Esta acción no se puede deshacer.`)) return;

  deleting.value = node.id;
  errorMsg.value = "";
  const { error } = await actions.nodes.delete({ id: node.id });
  deleting.value = null;

  if (error) {
    errorMsg.value = error.message;
    return;
  }
  removeById(tree.value, node.id);
  commit();
}

provide(NODE_TREE_KEY, {
  expanded,
  deleting,
  saving,
  toggleExpand,
  deleteNode,
  onDragEnd,
  canEdit,
  canDelete,
} satisfies NodeTreeContext);
</script>
