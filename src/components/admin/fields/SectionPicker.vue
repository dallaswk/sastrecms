<template>
  <dialog class="modal" :class="{ 'modal-open': open }">
    <div class="modal-box max-w-2xl">
      <h3 class="font-semibold text-lg">Añadir sección</h3>
      <p class="text-sm text-base-content/60 mt-1">
        Elige un bloque. Podrás moverlo y editarlo después.
      </p>

      <div v-for="group in groups" :key="group.key" class="mt-4">
        <p class="text-xs uppercase tracking-wide text-base-content/40 font-semibold mb-2">
          {{ group.label }}
        </p>
        <div class="grid sm:grid-cols-2 gap-2">
          <button
            v-for="def in group.items"
            :key="def.type"
            type="button"
            class="text-left border border-base-300 rounded-lg p-3 hover:border-primary hover:bg-base-200 transition-colors"
            @click="$emit('choose', def.type)"
          >
            <span class="font-medium text-sm">{{ def.icon }} {{ def.label }}</span>
            <span class="block text-xs text-base-content/60 mt-1">{{ def.description }}</span>
          </button>
        </div>
      </div>

      <p v-if="!groups.length" class="text-sm text-base-content/50 mt-4">
        Este tipo de contenido no permite ninguna sección.
      </p>

      <div class="modal-action">
        <button type="button" class="btn btn-ghost btn-sm" @click="$emit('close')">Cancelar</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop" @click="$emit('close')"><button>cerrar</button></form>
  </dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { pickableSections } from "@lib/sections/registry";
import { SECTION_GROUPS, SECTION_GROUP_LABELS } from "@lib/sections/types";

const props = defineProps<{ open: boolean; allowed?: string[] }>();
defineEmits<{ choose: [type: string]; close: [] }>();

/** Grouped so a long library stays scannable; empty groups are not shown. */
const groups = computed(() =>
  SECTION_GROUPS.map((key) => ({
    key,
    label: SECTION_GROUP_LABELS[key],
    items: pickableSections(props.allowed).filter((d) => d.group === key),
  })).filter((g) => g.items.length > 0)
);
</script>
