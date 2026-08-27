<template>
  <div class="flex flex-col gap-1">
    <select
      :value="(modelValue as string) ?? ''"
      class="select select-bordered"
      :required="field.required"
      :disabled="disabled || loading"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ loading ? "Cargando…" : "Sin relación" }}</option>
      <option v-for="opt in options" :key="opt.id" :value="opt.id">
        {{ opt.title }} — {{ opt.path }}
      </option>
    </select>

    <p v-if="error" class="text-error text-xs">{{ error }}</p>
    <p v-else-if="!loading && !options.length" class="text-xs text-base-content/50">
      No hay contenido {{ field.relatedContentType ? `de tipo "${field.relatedContentType}"` : "" }}
      que puedas enlazar.
    </p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { actions } from "astro:actions";
import type { FieldDefinition } from "@lib/fields/types";

const props = defineProps<{
  field: FieldDefinition;
  modelValue: unknown;
  disabled?: boolean;
}>();
defineEmits<{ "update:modelValue": [value: unknown] }>();

type Option = { id: string; title: string; path: string };

const options = ref<Option[]>([]);
const loading = ref(true);
const error = ref("");

/*
 * Shared across every relation field on the page.
 *
 * A page with a dozen sections carrying a relation field would otherwise fire a dozen
 * identical requests on mount. Keyed by content type because that is what varies, and
 * holding the promise rather than the result means concurrent mounts wait on one
 * request instead of racing.
 */
const cache = new Map<string, Promise<Option[]>>();

function load(contentTypeKey?: string): Promise<Option[]> {
  const key = contentTypeKey ?? "*";
  const hit = cache.get(key);
  if (hit) return hit;

  const request = actions.nodes
    .listForPicker({ contentTypeKey })
    .then(({ data, error: err }) => {
      if (err) throw new Error(err.message);
      return (data ?? []).map((n) => ({ id: n.id, title: n.title, path: n.path }));
    })
    .catch((err: unknown) => {
      // Do not cache a failure: the next field to mount should get a fresh attempt.
      cache.delete(key);
      throw err;
    });

  cache.set(key, request);
  return request;
}

onMounted(async () => {
  try {
    options.value = await load(props.field.relatedContentType);
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : "No se pudo cargar el contenido";
  } finally {
    loading.value = false;
  }
});
</script>
