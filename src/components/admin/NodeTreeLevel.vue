<template>
  <VueDraggable
    v-model="list"
    :group="{ name: 'sastre-nodes' }"
    :animation="150"
    :disabled="tree.saving.value"
    :force-fallback="true"
    :fallback-tolerance="3"
    fallback-class="node-dragging"
    handle=".node-handle"
    ghost-class="node-ghost"
    drag-class="node-dragging"
    class="flex flex-col gap-0.5"
    :class="items.length === 0 ? 'min-h-9 rounded-lg border border-dashed border-base-300' : ''"
    :style="{ marginLeft: depth > 0 ? '1.25rem' : undefined }"
    @end="tree.onDragEnd"
  >
    <div v-for="element in items" :key="element.id" class="flex flex-col">
      <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-base-200 group">
        <span
          class="node-handle text-base-content/30 select-none"
          :class="tree.canEdit(element) ? 'cursor-grab active:cursor-grabbing' : 'opacity-20 pointer-events-none'"
          :title="tree.canEdit(element) ? 'Arrastra para reordenar o anidar' : 'Sin permiso para mover este nodo'"
        >⠿</span>

        <button
          type="button"
          class="btn btn-xs btn-ghost btn-square"
          :class="element.children.length === 0 ? 'opacity-30' : ''"
          :aria-expanded="tree.expanded.value.has(element.id)"
          :title="element.children.length === 0 ? 'Abrir para anidar contenido dentro' : 'Plegar / desplegar'"
          @click="tree.toggleExpand(element.id)"
        >
          {{ tree.expanded.value.has(element.id) ? "▾" : "▸" }}
        </button>

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
          <a
            v-if="tree.canEdit(element)"
            :href="`/admin/content/${element.id}`"
            class="btn btn-xs btn-ghost"
          >Editar</a>
          <button
            v-if="tree.canDelete(element)"
            type="button"
            class="btn btn-xs btn-ghost text-error"
            :class="element.children.length > 0 ? 'btn-disabled opacity-30' : ''"
            :disabled="tree.deleting.value === element.id || element.children.length > 0"
            :title="element.children.length > 0 ? 'Vacía este nodo antes de borrarlo' : 'Borrar'"
            @click="tree.deleteNode(element)"
          >✕</button>
        </div>
      </div>

      <NodeTreeLevel
        v-if="tree.expanded.value.has(element.id)"
        :items="element.children"
        :depth="depth + 1"
      />
    </div>
  </VueDraggable>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { NODE_TREE_KEY, type NodeTreeContext, type TreeNode } from "./nodeTreeContext";

const props = defineProps<{
  items: TreeNode[];
  depth: number;
}>();

const tree = inject(NODE_TREE_KEY) as NodeTreeContext;

/*
 * force-fallback keeps SortableJS off the native HTML5 drag API. Nested lists behave
 * far more predictably that way (native dragover on a child list fights the parent's),
 * and the drag image becomes a plain styled clone instead of a browser screenshot.
 */

/**
 * VueDraggable only accepts v-model, but `items` is a slice of the root's tree and
 * must stay the same array instance for nested drops to land in the right branch.
 * The setter therefore rewrites it in place instead of reassigning the prop.
 */
const list = computed<TreeNode[]>({
  get: () => props.items,
  set: (value) => {
    props.items.splice(0, props.items.length, ...value);
  },
});
</script>

<style scoped>
.node-ghost {
  opacity: 0.4;
}
.node-dragging {
  opacity: 0.9;
}
</style>
