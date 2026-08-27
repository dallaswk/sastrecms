<template>
  <div class="flex flex-col gap-2">
    <p v-if="!subfields.length" class="text-sm text-base-content/40 italic">
      Este repetidor no tiene subcampos definidos. Añádelos en el tipo de contenido.
    </p>

    <VueDraggable
      v-else-if="items.length"
      v-model="draggable"
      :group="{ name: groupName }"
      :animation="150"
      :disabled="disabled"
      :force-fallback="true"
      handle=".repeater-handle"
      class="flex flex-col gap-2"
    >
      <div
        v-for="(item, index) in items"
        :key="item._lid"
        class="border border-base-300 rounded-lg bg-base-100"
      >
        <div class="flex items-center gap-2 px-3 py-2 border-b border-base-200">
          <span class="repeater-handle cursor-grab active:cursor-grabbing text-base-content/30 select-none">⠿</span>
          <span class="text-sm font-medium flex-1 truncate">{{ summaryOf(item, index) }}</span>
          <button
            type="button" class="btn btn-xs btn-ghost"
            :disabled="disabled" title="Duplicar"
            @click="duplicate(index)"
          >⧉</button>
          <button
            type="button" class="btn btn-xs btn-ghost text-error"
            :disabled="disabled" title="Quitar"
            @click="remove(index)"
          >✕</button>
        </div>

        <div class="p-3 flex flex-col gap-3">
          <FieldRenderer
            v-for="sub in subfields"
            :key="sub.key"
            :field="sub"
            :model-value="item[sub.key]"
            :path="`${path}.${index}.${sub.key}`"
            :disabled="disabled"
            :errors="errors"
            @update:model-value="setSubvalue(index, sub.key, $event)"
          />
        </div>
      </div>
    </VueDraggable>

    <button
      v-if="subfields.length"
      type="button"
      class="btn btn-sm btn-ghost border border-base-300 self-start"
      :disabled="disabled"
      @click="add"
    >+ Añadir {{ field.label.toLowerCase() }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import FieldRenderer from "./FieldRenderer.vue";
import { emptyFieldsFor, type FieldDefinition } from "@lib/fields/types";
import {
  withLocalIds,
  stripLocalIds,
  addItem,
  removeItem,
  duplicateItem,
  replaceItem,
  asList,
  type WithLocalId,
} from "./itemList";

const props = defineProps<{
  field: FieldDefinition;
  modelValue: unknown;
  path: string;
  disabled?: boolean;
  errors?: Record<string, string>;
}>();
const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

const subfields = computed(() => props.field.subfields ?? []);

/*
 * Its own drag group, unlike the node tree where a shared group is the point. Two
 * repeaters on the same form hold different schemas, so dragging an item across would
 * produce an object whose keys belong to the other field.
 */
const groupName = computed(() => `repeater-${props.path}`);

type Item = WithLocalId<Record<string, unknown>>;
const items = ref<Item[]>(withLocalIds(asList(props.modelValue)));

/*
 * Local ids are display-only, so they are rebuilt when the value changes from outside
 * (loading a node) but not on our own edits, which would remount every row mid-typing.
 */
let ownEdit = false;
watch(
  () => props.modelValue,
  (value) => {
    if (ownEdit) {
      ownEdit = false;
      return;
    }
    items.value = withLocalIds(asList(value));
  }
);

function commit(next: Item[]) {
  items.value = next;
  ownEdit = true;
  emit("update:modelValue", stripLocalIds(next));
}

/** VueDraggable only takes v-model; reordering is the one path that writes items itself. */
const draggable = computed<Item[]>({
  get: () => items.value,
  set: (value) => commit(value),
});

function add() {
  commit(addItem(items.value, withLocalIds([emptyFieldsFor(subfields.value)])[0]));
}
function remove(index: number) {
  commit(removeItem(items.value, index));
}
function duplicate(index: number) {
  // Fresh local ids on the copy, or Vue would see two rows claiming the same :key.
  commit(withLocalIds(stripLocalIds(duplicateItem(items.value, index))));
}
function setSubvalue(index: number, key: string, value: unknown) {
  commit(replaceItem(items.value, index, { ...items.value[index], [key]: value }));
}

/** First text-ish subfield with content, so a collapsed row is identifiable. */
function summaryOf(item: Item, index: number): string {
  for (const sub of subfields.value) {
    const value = item[sub.key];
    if (typeof value === "string" && value.trim()) return value.slice(0, 60);
  }
  return `${props.field.label} ${index + 1}`;
}
</script>
