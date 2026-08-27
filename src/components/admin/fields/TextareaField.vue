<template>
  <textarea
    :value="(modelValue as string) ?? ''"
    class="textarea textarea-bordered"
    rows="4"
    :required="field.required"
    :disabled="disabled"
    @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<script setup lang="ts">
import type { FieldDefinition } from "@lib/fields/types";

defineProps<{ field: FieldDefinition; modelValue: unknown; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: unknown] }>();
</script>
