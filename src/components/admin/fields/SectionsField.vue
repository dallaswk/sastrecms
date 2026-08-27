<template>
  <div class="flex flex-col gap-2">
    <VueDraggable
      v-if="sections.length"
      v-model="draggable"
      :group="{ name: groupName }"
      :animation="150"
      :disabled="disabled"
      :force-fallback="true"
      :fallback-tolerance="3"
      handle=".section-handle"
      class="flex flex-col gap-2"
    >
      <SectionCard
        v-for="(section, index) in sections"
        :key="section.id"
        :section="section"
        :path="`${path}.${index}`"
        :disabled="disabled"
        :errors="errors"
        :start-open="section.id === justAdded"
        @set-field="(key, value) => setField(index, key, value)"
        @set-anchor="(value) => setAnchor(index, value)"
        @toggle-hidden="toggleHidden(index)"
        @duplicate="duplicate(index)"
        @remove="remove(index)"
      />
    </VueDraggable>

    <p v-else class="text-sm text-base-content/50 border border-dashed border-base-300 rounded-lg px-3 py-6 text-center">
      Esta página no tiene secciones todavía.
    </p>

    <button
      type="button"
      class="btn btn-sm btn-ghost border border-base-300 self-start"
      :disabled="disabled"
      @click="pickerOpen = true"
    >+ Añadir sección</button>

    <SectionPicker
      :open="pickerOpen"
      :allowed="field.allowedSections"
      @choose="onChoose"
      @close="pickerOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import SectionCard from "./SectionCard.vue";
import SectionPicker from "./SectionPicker.vue";
import { getSection } from "@lib/sections/registry";
import type { SectionInstance } from "@lib/sections/types";
import type { FieldDefinition } from "@lib/fields/types";
import { emptyFieldsFor } from "@lib/fields/types";
import { generateId } from "@lib/id";
import { addItem, removeItem, replaceItem } from "./itemList";

const props = defineProps<{
  field: FieldDefinition;
  modelValue: unknown;
  path: string;
  disabled?: boolean;
  errors?: Record<string, string>;
}>();
const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

/*
 * Its own drag group. The node tree deliberately shares one so blocks can move between
 * levels; here two sections fields on the same page hold different `allowedSections`, so
 * dragging across would produce a block the other field is not allowed to contain.
 */
const groupName = computed(() => `sections-${props.path}`);

const pickerOpen = ref(false);
const justAdded = ref("");

/**
 * Unlike repeater items, sections carry a persisted `id`, so it is the `:key` directly —
 * no local id bookkeeping. That id is also what lets an agent address one block through
 * MCP instead of counting positions.
 */
function readSections(value: unknown): SectionInstance[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is SectionInstance => !!s && typeof s === "object" && typeof (s as SectionInstance).type === "string"
  );
}

const sections = ref<SectionInstance[]>(readSections(props.modelValue));

let ownEdit = false;
watch(
  () => props.modelValue,
  (value) => {
    if (ownEdit) {
      ownEdit = false;
      return;
    }
    sections.value = readSections(value);
  }
);

function commit(next: SectionInstance[]) {
  sections.value = next;
  ownEdit = true;
  emit("update:modelValue", next);
}

const draggable = computed<SectionInstance[]>({
  get: () => sections.value,
  set: (value) => commit(value),
});

function onChoose(type: string) {
  const def = getSection(type);
  pickerOpen.value = false;
  if (!def) return;

  const section: SectionInstance = {
    id: generateId("sec"),
    type,
    // The server re-stamps this from the registry; setting it here keeps a block written
    // offline consistent with what it was authored against.
    v: def.version,
    data: { ...emptyFieldsFor(def.fields), ...(def.defaults ?? {}) },
  };
  justAdded.value = section.id;
  commit(addItem(sections.value, section));
}

function setField(index: number, key: string, value: unknown) {
  const current = sections.value[index];
  commit(replaceItem(sections.value, index, { ...current, data: { ...current.data, [key]: value } }));
}

function setAnchor(index: number, value: string) {
  const current = sections.value[index];
  const next = { ...current };
  if (value.trim()) next.anchor = value.trim();
  else delete next.anchor;
  commit(replaceItem(sections.value, index, next));
}

function toggleHidden(index: number) {
  const current = sections.value[index];
  const next = { ...current };
  if (current.hidden) delete next.hidden;
  else next.hidden = true;
  commit(replaceItem(sections.value, index, next));
}

function duplicate(index: number) {
  // A fresh id, always: two blocks sharing one would make patch_section ambiguous and
  // give Vue two rows claiming the same :key.
  const copy: SectionInstance = {
    ...structuredClone(sections.value[index]),
    id: generateId("sec"),
  };
  delete copy.anchor;
  commit(addItem(sections.value, copy, index + 1));
}

function remove(index: number) {
  commit(removeItem(sections.value, index));
}
</script>
