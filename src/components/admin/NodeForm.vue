<template>
  <form @submit.prevent="handleSubmit" class="flex flex-col gap-6 max-w-3xl">

    <!-- Title -->
    <div class="form-control">
      <label class="label"><span class="label-text font-medium">Título *</span></label>
      <input v-model="form.title" type="text" class="input input-bordered" required @input="autoSlug" />
    </div>

    <!-- Slug -->
    <div class="form-control">
      <label class="label">
        <span class="label-text font-medium">Slug</span>
        <span class="label-text-alt text-base-content/50">Se genera del título</span>
      </label>
      <div class="flex">
        <span class="bg-base-200 px-3 flex items-center text-sm text-base-content/50 border border-base-300 border-r-0 rounded-l-lg">
          {{ parentPath ?? "" }}/
        </span>
        <input v-model="form.slug" type="text" class="input input-bordered rounded-l-none flex-1" @input="slugTouched = true" />
      </div>
    </div>

    <!-- Locale -->
    <div v-if="availableLocales.length > 1" class="form-control">
      <label class="label"><span class="label-text font-medium">Idioma</span></label>
      <select v-model="form.locale" class="select select-bordered w-48">
        <option v-for="loc in availableLocales" :key="loc" :value="loc">{{ loc }}</option>
      </select>
    </div>

    <!-- Dynamic fields -->
    <FieldRenderer
      v-for="field in fieldSchema"
      :key="field.key"
      :field="field"
      :model-value="form.fields[field.key]"
      :path="`fields.${field.key}`"
      :disabled="editDisabled"
      @update:model-value="form.fields[field.key] = $event"
    />

    <!-- Translations accordion -->
    <div v-if="nodeId" class="collapse collapse-arrow border border-base-300 rounded-lg">
      <input type="checkbox" />
      <div class="collapse-title font-medium flex items-center gap-2">
        Traducciones
        <span v-if="linkedTranslations.length > 0" class="badge badge-primary badge-sm">{{ linkedTranslations.length }}</span>
      </div>
      <div class="collapse-content flex flex-col gap-4 pt-2">

        <!-- Existing links -->
        <div v-if="linkedTranslations.length > 0" class="flex flex-col gap-2">
          <p class="text-sm text-base-content/60">Versiones vinculadas:</p>
          <div v-for="t in linkedTranslations" :key="t.id" class="flex items-center justify-between p-2 rounded-lg bg-base-200">
            <div class="flex items-center gap-2">
              <span class="badge badge-ghost badge-sm">{{ t.locale }}</span>
              <a :href="`/admin/content/${t.id}`" class="text-sm font-medium hover:underline">{{ t.title }}</a>
              <span class="text-xs text-base-content/40 font-mono">{{ t.path }}</span>
            </div>
            <button type="button" class="btn btn-xs btn-ghost text-error" @click="unlinkTranslation(t.id)">Desvincular</button>
          </div>
        </div>
        <p v-else class="text-sm text-base-content/50">Este nodo no tiene traducciones vinculadas.</p>

        <!-- Link new translation -->
        <div class="flex flex-col gap-2">
          <p class="text-sm font-medium">Vincular traducción existente:</p>
          <div class="flex gap-2">
            <select v-model="pickerNodeId" class="select select-bordered select-sm flex-1">
              <option value="">Seleccionar nodo...</option>
              <optgroup v-for="loc in otherLocales" :key="loc" :label="loc">
                <option
                  v-for="n in pickerNodes.filter(n => n.locale === loc)"
                  :key="n.id"
                  :value="n.id"
                >
                  {{ n.title }} ({{ n.path }})
                </option>
              </optgroup>
            </select>
            <button type="button" class="btn btn-sm btn-primary" :disabled="!pickerNodeId || linking" @click="linkTranslation">
              <span v-if="linking" class="loading loading-spinner loading-xs"></span>
              Vincular
            </button>
          </div>
          <p v-if="translationMsg" class="text-sm" :class="translationError ? 'text-error' : 'text-success'">{{ translationMsg }}</p>
        </div>
      </div>
    </div>

    <!-- SEO accordion -->
    <div class="collapse collapse-arrow border border-base-300 rounded-lg">
      <input type="checkbox" />
      <div class="collapse-title font-medium">SEO</div>
      <div class="collapse-content flex flex-col gap-4 pt-2">
        <div class="form-control">
          <label class="label"><span class="label-text">Meta título</span></label>
          <input v-model="form.seo.metaTitle" type="text" class="input input-bordered" />
        </div>
        <div class="form-control">
          <label class="label"><span class="label-text">Meta descripción</span></label>
          <textarea v-model="form.seo.metaDescription" class="textarea textarea-bordered" rows="2" />
        </div>
        <div class="form-control">
          <label class="label">
            <span class="label-text">No indexar</span>
            <input v-model="form.seo.noindex" type="checkbox" class="toggle toggle-sm" />
          </label>
        </div>
      </div>
    </div>

    <!-- Status + submit -->
    <div class="flex items-center gap-4 pt-2 flex-wrap">
      <select v-model="form.status" class="select select-bordered w-40" :disabled="editDisabled || (!canPublish && form.status !== 'draft')">
        <option value="draft">Borrador</option>
        <option v-if="canPublish !== false" value="published">Publicado</option>
        <option v-if="canPublish !== false" value="scheduled">Programado</option>
      </select>

      <button type="submit" class="btn btn-primary" :disabled="saving || editDisabled">
        <span v-if="saving" class="loading loading-spinner loading-sm"></span>
        {{ nodeId ? "Guardar cambios" : "Crear nodo" }}
      </button>

      <span v-if="successMsg" class="text-success text-sm">{{ successMsg }}</span>
      <span v-if="errorMsg" class="text-error text-sm">{{ errorMsg }}</span>
    </div>
  </form>

  <!-- Media picker modal -->
  <MediaPickerModal
    :open="pickerOpen"
    :multiple="pickerMultiple"
    @close="settlePick([])"
    @selected="settlePick"
  />
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, provide } from "vue";
import { actions } from "astro:actions";
import RichTextEditor from "./RichTextEditor.vue";
import MediaPickerModal from "./MediaPickerModal.vue";
import FieldRenderer from "./fields/FieldRenderer.vue";
import { MEDIA_PICKER_KEY, type MediaPickerContext } from "./fields/useMediaPicker";
import { initialValueFor } from "@lib/fields/types";

interface FieldDefinition {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

interface TranslationLink {
  id: string;
  locale: string;
  title: string;
  path: string;
}

const props = defineProps<{
  nodeId?: string;
  contentTypeId: string;
  fieldSchema: FieldDefinition[];
  parentPath?: string;
  availableLocales?: string[];
  translations?: TranslationLink[];
  canEdit?: boolean;
  canPublish?: boolean;
  canDelete?: boolean;
  initialData?: {
    title?: string;
    slug?: string;
    locale?: string;
    translationGroupId?: string;
    fields?: Record<string, unknown>;
    seo?: Record<string, unknown>;
    status?: string;
  };
}>();

const emit = defineEmits<{ saved: [id: string] }>();

const saving = ref(false);
const successMsg = ref("");
const errorMsg = ref("");
const slugTouched = ref(false);

const pickerOpen = ref(false);
const pickerMultiple = ref(false);

const availableLocales = props.availableLocales ?? ["es"];

const linkedTranslations = ref<TranslationLink[]>(props.translations ?? []);
const pickerNodes = ref<{ id: string; title: string; path: string; locale: string }[]>([]);
const pickerNodeId = ref("");
const linking = ref(false);
const translationMsg = ref("");
const translationError = ref(false);

const editDisabled = computed(() => props.canEdit === false);

const otherLocales = computed(() =>
  availableLocales.filter((l) => l !== form.locale && !linkedTranslations.value.some((t) => t.locale === l))
);

async function loadPickerNodes() {
  if (!props.nodeId) return;
  const { data } = await actions.nodes.listForPicker({
    excludeId: props.nodeId,
  });
  if (data) pickerNodes.value = data;
}

async function linkTranslation() {
  if (!props.nodeId || !pickerNodeId.value) return;
  linking.value = true;
  translationMsg.value = "";
  const { data, error } = await actions.nodes.linkTranslation({
    nodeId: props.nodeId,
    targetId: pickerNodeId.value,
  });
  linking.value = false;
  if (error) {
    translationMsg.value = error.message;
    translationError.value = true;
    return;
  }
  translationMsg.value = "Traducción vinculada";
  translationError.value = false;
  const linked = pickerNodes.value.find((n) => n.id === pickerNodeId.value);
  if (linked) linkedTranslations.value.push(linked);
  pickerNodeId.value = "";
}

async function unlinkTranslation(targetId: string) {
  if (!confirm("¿Desvincular esta traducción?")) return;
  const { error } = await actions.nodes.unlinkTranslation({ nodeId: targetId });
  if (error) {
    translationMsg.value = error.message;
    translationError.value = true;
    return;
  }
  linkedTranslations.value = linkedTranslations.value.filter((t) => t.id !== targetId);
  translationMsg.value = "Desvinculado";
  translationError.value = false;
}

const form = reactive({
  title: props.initialData?.title ?? "",
  slug: props.initialData?.slug ?? "",
  locale: props.initialData?.locale ?? availableLocales[0],
  fields: reactive<Record<string, unknown>>(
    Object.fromEntries(
      // The coercion rule lives in @lib/fields/types so the editor, the nested editors
      // and the server all start a field from the same value.
      props.fieldSchema.map((f) => [f.key, initialValueFor(f, props.initialData?.fields?.[f.key])])
    )
  ),
  seo: reactive({
    metaTitle: (props.initialData?.seo?.metaTitle as string) ?? "",
    metaDescription: (props.initialData?.seo?.metaDescription as string) ?? "",
    noindex: (props.initialData?.seo?.noindex as boolean) ?? false,
  }),
  status: props.initialData?.status ?? "draft",
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function autoSlug() {
  if (!slugTouched.value) form.slug = slugify(form.title);
}

/*
 * One modal for the whole form, handed to the fields through provide/inject.
 *
 * Each field awaits its own selection, which replaces the previous `pickerTargetField`
 * string — the form no longer has to remember whose turn it was, and nested editors
 * (repeater items, sections) get the picker for free without mounting their own.
 */
let resolvePick: ((urls: string[]) => void) | null = null;

function settlePick(urls: string[]) {
  pickerOpen.value = false;
  const resolve = resolvePick;
  resolvePick = null;
  resolve?.(urls);
}

provide(MEDIA_PICKER_KEY, {
  pick(multiple: boolean) {
    // A picker already open is abandoned rather than left hanging on its promise.
    resolvePick?.([]);
    pickerMultiple.value = multiple;
    pickerOpen.value = true;
    return new Promise<string[]>((resolve) => {
      resolvePick = resolve;
    });
  },
} satisfies MediaPickerContext);

async function handleSubmit() {
  saving.value = true;
  errorMsg.value = "";
  successMsg.value = "";

  try {
    if (props.nodeId) {
      const { error } = await actions.nodes.update({
        id: props.nodeId,
        title: form.title,
        slug: form.slug,
        fields: form.fields,
        seo: form.seo,
        status: form.status as "draft" | "published" | "scheduled",
      });
      if (error) throw new Error(error.message);
      successMsg.value = "Guardado";
      emit("saved", props.nodeId);
    } else {
      const { data, error } = await actions.nodes.create({
        contentTypeId: props.contentTypeId,
        title: form.title,
        slug: form.slug,
        locale: form.locale,
        fields: form.fields,
        seo: form.seo,
        status: form.status as "draft" | "published" | "scheduled",
      });
      if (error) throw new Error(error.message);
      successMsg.value = "Creado";
      emit("saved", data!.id);
      window.location.href = `/admin/content/${data!.id}`;
    }
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : "Error desconocido";
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  if (!props.initialData?.slug) form.slug = slugify(form.title);
  if (props.nodeId) loadPickerNodes();
});
</script>
