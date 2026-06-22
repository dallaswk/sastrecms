<template>
  <div class="flex flex-col gap-1" :data-parent-id="parentId ?? 'root'">
    <VueDraggable
      v-model="items"
      :animation="150"
      handle=".drag-handle"
      :group="{ name: 'nodes', pull: true, put: true }"
      item-key="id"
      :data-parent-id="parentId ?? 'root'"
      @end="onEnd"
    >
      <template #item="{ element }">
        <div class="flex flex-col">
          <!-- Row -->
          <div
            class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-base-200 group"
            :style="{ paddingLeft: `${depth * 1.25 + 0.5}rem` }"
          >
            <span class="drag-handle cursor-grab text-base-content/30 hover:text-base-content/60 select-none text-lg leading-none">⠿</span>

            <button
              v-if="element.children?.length"
              type="button"
              class="btn btn-xs btn-ghost btn-square"
              @click="toggleExpand(element.id)"
            >
              {{ expanded.has(element.id) ? "▾" : "▸" }}
            </button>
            <span v-else class="w-6" />

            <span class="text-xs">{{ element.contentType?.icon ?? "📄" }}</span>

            <a
              :href="`/admin/content/${element.id}`"
              class="flex-1 text-sm font-medium truncate hover:text-primary"
            >
              {{ element.title }}
            </a>

            <span class="font-mono text-xs text-base-content/40 hidden sm:block truncate max-w-32">
              {{ element.path }}
            </span>

            <span
              class="badge badge-sm shrink-0"
              :class="{
                'badge-success': element.status === 'published',
                'badge-warning': element.status === 'scheduled',
                'badge-ghost': element.status === 'draft',
              }"
            >
              {{ element.status }}
            </span>

            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <a :href="`/admin/content/${element.id}`" class="btn btn-xs btn-ghost">Editar</a>
              <button
                type="button"
                class="btn btn-xs btn-ghost text-error"
                :disabled="deleting === element.id"
                @click="deleteNode(element)"
              >✕</button>
            </div>
          </div>

          <!-- Children container -->
          <div v-if="expanded.has(element.id)" class="flex flex-col">
            <NodeTree
              :nodes="element.children ?? []"
              :depth="depth + 1"
              :parent-id="element.id"
              @reorder="onChildReorder"
            />
          </div>
        </div>
      </template>
    </VueDraggable>

    <p v-if="errorMsg" class="text-error text-xs px-2 pt-1">{{ errorMsg }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { actions } from "astro:actions";

export interface TreeNode {
  id: string;
  title: string;
  path: string;
  status: string;
  position: number;
  parentId: string | null;
  contentType?: { key: string; label: string; icon?: string };
  children?: TreeNode[];
}

interface ReorderItem {
  id: string;
  position: number;
  parentId: string | null;
}

const props = defineProps<{
  nodes: TreeNode[];
  depth?: number;
  parentId?: string | null;
}>();

const emit = defineEmits<{
  reorder: [items: ReorderItem[]];
}>();

const depth = props.depth ?? 0;
const parentId = props.parentId ?? null;
const items = ref<TreeNode[]>([...props.nodes]);
const expanded = ref<Set<string>>(new Set(props.nodes.map((n) => n.id)));
const deleting = ref<string | null>(null);
const errorMsg = ref("");

watch(() => props.nodes, (v) => { items.value = [...v]; }, { deep: true });

function toggleExpand(id: string) {
  if (expanded.value.has(id)) expanded.value.delete(id);
  else expanded.value.add(id);
}

function buildUpdates(list: TreeNode[], newParentId: string | null): ReorderItem[] {
  return list.map((node, idx) => ({
    id: node.id,
    position: idx,
    parentId: newParentId,
  }));
}

async function persistUpdates(updates: ReorderItem[]) {
  if (updates.length === 0) return;
  const { error } = await actions.nodes.reorder({ items: updates });
  if (error) errorMsg.value = error.message;
}

async function onEnd(evt: any) {
  errorMsg.value = "";
  const target = evt.to as HTMLElement | null;
  const newParentId = target?.dataset.parentId === "root" ? null : target?.dataset.parentId ?? parentId;

  // Collect updates for the destination container with the correct parentId
  const updates = buildUpdates(items.value, newParentId);
  await persistUpdates(updates);
  if (!errorMsg.value) {
    window.location.reload();
  }
}

async function onChildReorder(childUpdates: ReorderItem[]) {
  await persistUpdates(childUpdates);
}

async function deleteNode(node: TreeNode) {
  if (!confirm(`¿Borrar "${node.title}"? Esta acción no se puede deshacer.`)) return;
  deleting.value = node.id;
  errorMsg.value = "";
  const { error } = await actions.nodes.delete({ id: node.id });
  if (error) {
    errorMsg.value = error.message;
    deleting.value = null;
  } else {
    items.value = items.value.filter((n) => n.id !== node.id);
    deleting.value = null;
  }
}
</script>
