<template>
  <div class="flex flex-col gap-2">
    <div
      v-if="url"
      class="relative w-40 h-28 rounded-lg overflow-hidden border border-base-300 group"
    >
      <img :src="url" class="w-full h-full object-cover" alt="" />
      <button
        type="button"
        class="absolute top-1 right-1 btn btn-xs btn-circle btn-error opacity-0 group-hover:opacity-100"
        :disabled="disabled"
        @click="$emit('update:modelValue', '')"
      >✕</button>
    </div>
    <button
      type="button"
      class="btn btn-sm btn-ghost border border-base-300 self-start"
      :disabled="disabled"
      @click="choose"
    >
      {{ url ? "Cambiar imagen" : "Seleccionar imagen" }}
    </button>
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
const url = computed(() => (props.modelValue as string) || "");

async function choose() {
  if (!picker) return;
  const [first] = await picker.pick(false);
  // Dismissing the modal resolves with nothing; keep whatever was there.
  if (first) emit("update:modelValue", first);
}
</script>
