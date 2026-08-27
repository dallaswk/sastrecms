<template>
  <select
    :value="(modelValue as string) ?? ''"
    class="select select-bordered"
    :required="field.required"
    :disabled="disabled"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option value="">Seleccionar…</option>
    <option v-for="opt in field.options ?? []" :key="opt" :value="opt">{{ opt }}</option>
  </select>
</template>

<script setup lang="ts">
import type { FieldDefinition } from "@lib/fields/types";

defineProps<{ field: FieldDefinition; modelValue: unknown; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: unknown] }>();
</script>
