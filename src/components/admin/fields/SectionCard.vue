<template>
  <div class="border border-base-300 rounded-lg bg-base-100">
    <div class="flex items-center gap-2 px-3 py-2" :class="open ? 'border-b border-base-200' : ''">
      <span class="section-handle cursor-grab active:cursor-grabbing text-base-content/30 select-none">⠿</span>

      <button type="button" class="btn btn-xs btn-ghost btn-square" @click="open = !open">
        {{ open ? "▾" : "▸" }}
      </button>

      <span class="text-xs">{{ def?.icon ?? "▫" }}</span>
      <span class="text-sm font-medium">{{ def?.label ?? section.type }}</span>
      <span class="text-sm text-base-content/50 flex-1 truncate">{{ summary }}</span>

      <span v-if="section.hidden" class="badge badge-ghost badge-sm">oculta</span>

      <button
        type="button" class="btn btn-xs btn-ghost" :disabled="disabled"
        :title="section.hidden ? 'Mostrar' : 'Ocultar sin borrar'"
        @click="$emit('toggleHidden')"
      >{{ section.hidden ? "◉" : "◎" }}</button>
      <button
        type="button" class="btn btn-xs btn-ghost" :disabled="disabled" title="Duplicar"
        @click="$emit('duplicate')"
      >⧉</button>
      <button
        type="button" class="btn btn-xs btn-ghost text-error" :disabled="disabled" title="Quitar"
        @click="$emit('remove')"
      >✕</button>
    </div>

    <div v-if="open" class="p-3 flex flex-col gap-3">
      <p v-if="!def" class="text-sm text-warning">
        Esta sección es de un tipo que ya no existe ("{{ section.type }}"). No se pintará en
        el sitio. Puedes quitarla sin miedo.
      </p>

      <template v-else>
        <FieldRenderer
          v-for="field in def.fields"
          :key="field.key"
          :field="field"
          :model-value="section.data[field.key]"
          :path="`${path}.data.${field.key}`"
          :disabled="disabled"
          :errors="errors"
          @update:model-value="$emit('setField', field.key, $event)"
        />

        <label class="form-control">
          <span class="label-text text-xs text-base-content/50">
            Ancla para enlazar desde un menú (opcional)
          </span>
          <input
            :value="section.anchor ?? ''"
            type="text"
            class="input input-bordered input-sm font-mono"
            :placeholder="section.id"
            :disabled="disabled"
            @input="$emit('setAnchor', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import FieldRenderer from "./FieldRenderer.vue";
import { getSection } from "@lib/sections/registry";
import type { SectionInstance } from "@lib/sections/types";

const props = defineProps<{
  section: SectionInstance;
  path: string;
  disabled?: boolean;
  errors?: Record<string, string>;
  startOpen?: boolean;
}>();

defineEmits<{
  setField: [key: string, value: unknown];
  setAnchor: [value: string];
  toggleHidden: [];
  duplicate: [];
  remove: [];
}>();

const open = ref(props.startOpen ?? false);
const def = computed(() => getSection(props.section.type));

/** First non-empty text value, so a collapsed block is identifiable at a glance. */
const summary = computed(() => {
  for (const field of def.value?.fields ?? []) {
    const value = props.section.data[field.key];
    if (typeof value === "string" && value.trim()) return value.slice(0, 60);
  }
  return "";
});
</script>
