<template>
  <div class="flex items-start gap-4">
    <!-- The form is read with FormData on submit, so the value reaches it through a real
         input rather than through any bridge between the island and the page. -->
    <input type="hidden" :name="name" :value="value" />

    <div
      class="rounded-lg border border-base-300 bg-base-200 flex items-center justify-center overflow-hidden shrink-0"
      :class="square ? 'w-16 h-16' : 'w-32 h-16'"
    >
      <img v-if="value" :src="value" alt="" class="max-w-full max-h-full object-contain" />
      <span v-else class="text-xs text-base-content/40">sin imagen</span>
    </div>

    <div class="flex flex-col gap-2 min-w-0">
      <div class="flex gap-2">
        <button type="button" class="btn btn-sm btn-ghost border border-base-300" @click="pickerOpen = true">
          {{ value ? "Cambiar" : "Seleccionar imagen" }}
        </button>
        <button v-if="value" type="button" class="btn btn-sm btn-ghost text-error" @click="value = ''">
          Quitar
        </button>
      </div>

      <!-- Still editable by hand: an existing site may point at an image hosted elsewhere,
           and taking that away would be a regression dressed as an improvement. -->
      <input
        v-model="value"
        type="text"
        class="input input-bordered input-xs font-mono w-72"
        placeholder="o pega una URL"
      />
      <p v-if="hint" class="text-xs text-base-content/40">{{ hint }}</p>
    </div>

    <MediaPickerModal
      :open="pickerOpen"
      :multiple="false"
      @close="pickerOpen = false"
      @selected="onSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import MediaPickerModal from "./MediaPickerModal.vue";

const props = defineProps<{
  /** Form field name, so FormData picks the value up. */
  name: string;
  initial?: string;
  /** Square preview, for a favicon. */
  square?: boolean;
  hint?: string;
}>();

const value = ref(props.initial ?? "");
const pickerOpen = ref(false);

function onSelected(urls: string[]) {
  if (urls[0]) value.value = urls[0];
  pickerOpen.value = false;
}
</script>
