<template>
  <RichTextEditor
    :model-value="(modelValue as string) ?? ''"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import RichTextEditor from "../RichTextEditor.vue";
import type { FieldDefinition } from "@lib/fields/types";

defineProps<{ field: FieldDefinition; modelValue: unknown; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: unknown] }>();
</script>
