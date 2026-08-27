<template>
  <div class="flex flex-col gap-2">
    <div v-if="urls.length" class="flex flex-wrap gap-2">
      <div
        v-for="(url, idx) in urls"
        :key="`${idx}-${url}`"
        class="relative w-24 h-20 rounded-lg overflow-hidden border border-base-300 group"
      >
        <img :src="url" class="w-full h-full object-cover" alt="" />
        <button
          type="button"
          class="absolute top-1 right-1 btn btn-xs btn-circle btn-error opacity-0 group-hover:opacity-100"
          :disabled="disabled"
          @click="removeAt(idx)"
        >✕</button>
      </div>
    </div>
    <button
      type="button"
      class="btn btn-sm btn-ghost border border-base-300 self-start"
      :disabled="disabled"
      @click="add"
    >+ Añadir imágenes</button>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import type { FieldDefinition } from "@lib/fields/types";
import { MEDIA_PICKER_KEY } from "./useMediaPicker";

const props = defineProps<{
  field: FieldDefinition;
  modelValue: unknown;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

const picker = inject(MEDIA_PICKER_KEY);
// Tolerates a legacy string or a missing value: a gallery is always a list here.
const urls = computed<string[]>(() => {
  const value = props.modelValue;
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return typeof value === "string" && value ? [value] : [];
});

async function add() {
  if (!picker) return;
  const picked = await picker.pick(true);
  if (picked.length) emit("update:modelValue", [...urls.value, ...picked]);
}

function removeAt(idx: number) {
  const next = urls.value.slice();
  next.splice(idx, 1);
  emit("update:modelValue", next);
}
</script>
