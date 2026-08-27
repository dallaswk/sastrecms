<template>
  <div class="form-control">
    <label v-if="!hideLabel" class="label">
      <span class="label-text font-medium">
        {{ field.label }}
        <span v-if="field.required" class="text-error ml-1">*</span>
      </span>
    </label>

    <component
      :is="component"
      v-if="component"
      :field="field"
      :model-value="modelValue"
      :path="path"
      :disabled="disabled"
      :errors="errors"
      @update:model-value="$emit('update:modelValue', $event)"
    />

    <p v-else class="text-sm text-base-content/40 italic">
      Campo tipo "{{ field.type }}" — sin editor
    </p>

    <p v-if="error" class="text-error text-xs mt-1">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import type { Component } from "vue";
import { type FieldDefinition, type FieldType } from "@lib/fields/types";
import TextField from "./TextField.vue";
import TextareaField from "./TextareaField.vue";
import SelectField from "./SelectField.vue";
import RichTextField from "./RichTextField.vue";
import ImageField from "./ImageField.vue";
import GalleryField from "./GalleryField.vue";

/**
 * One dispatcher, one contract, used by the node form and by every nested context —
 * repeater items and section blocks. Extracting this out of NodeForm is what lets
 * repeater, relation and sections share a single field system instead of three.
 */
const props = defineProps<{
  field: FieldDefinition;
  modelValue: unknown;
  /** Dotted path of this value, e.g. `fields.sections.2.data.title`. Indexes server errors. */
  path: string;
  disabled?: boolean;
  /** Server-side validation errors, keyed by path. */
  errors?: Record<string, string>;
  /** Nested editors draw their own headings. */
  hideLabel?: boolean;
}>();

defineEmits<{ "update:modelValue": [value: unknown] }>();

/*
 * RepeaterField and SectionsField render FieldRenderer again, so importing them
 * statically makes a cycle between files. Vue does not always resolve A→B→A, and when it
 * fails the symptom is a blank form with nothing in the console — the worst failure mode
 * available. defineAsyncComponent breaks the cycle explicitly.
 */
const RepeaterField = defineAsyncComponent(() => import("./RepeaterField.vue"));
const RelationField = defineAsyncComponent(() => import("./RelationField.vue"));
const SectionsField = defineAsyncComponent(() => import("./SectionsField.vue"));

const COMPONENTS: Record<FieldType, Component | null> = {
  text: TextField,
  number: TextField,
  date: TextField,
  textarea: TextareaField,
  select: SelectField,
  richtext: RichTextField,
  image: ImageField,
  gallery: GalleryField,
  relation: RelationField,
  repeater: RepeaterField,
  sections: SectionsField,
};

const component = computed(() => COMPONENTS[props.field.type] ?? null);
const error = computed(() => props.errors?.[props.path]);
</script>
