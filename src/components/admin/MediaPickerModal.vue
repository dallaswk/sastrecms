<template>
  <!-- z-[60], above the drawer's z-50: at equal z-index the sidebar wins because it comes
       later in the document, so the picker opened *behind* it. -->
  <div v-if="open" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" @click.self="close">
    <div class="bg-base-100 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b border-base-300">
        <h2 class="font-semibold text-lg">
          {{ multiple ? "Seleccionar archivos" : "Seleccionar archivo" }}
        </h2>
        <button type="button" class="btn btn-ghost btn-sm btn-square" @click="close">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto p-6">
        <MediaManager
          :picker-mode="true"
          :multiple="multiple"
          @selected="onSelected"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import MediaManager from "./MediaManager.vue";

const props = defineProps<{
  open: boolean;
  multiple?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  selected: [urls: string[]];
}>();

function close() {
  emit("close");
}

function onSelected(urls: string[]) {
  emit("selected", urls);
  close();
}
</script>
