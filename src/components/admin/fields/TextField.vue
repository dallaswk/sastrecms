<template>
  <input
    :value="modelValue ?? ''"
    :type="inputType"
    class="input input-bordered"
    :required="field.required"
    :disabled="disabled"
    @input="onInput"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { FieldDefinition } from "@lib/fields/types";

const props = defineProps<{
  field: FieldDefinition;
  modelValue: unknown;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

const inputType = computed(() =>
  props.field.type === "number" ? "number" : props.field.type === "date" ? "date" : "text"
);

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  // A number field emits a number, or null when cleared — never the string "" and never
  // 0, so an empty field is not saved as a zero.
  if (props.field.type === "number") {
    emit("update:modelValue", raw === "" ? null : Number(raw));
    return;
  }
  emit("update:modelValue", raw);
}
</script>
