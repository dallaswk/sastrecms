<template>
  <form @submit.prevent="handleSubmit" class="flex flex-col gap-6 max-w-3xl">
    <!-- Title -->
    <div class="form-control">
      <label class="label"><span class="label-text font-medium">Título *</span></label>
      <input
        v-model="form.title"
        type="text"
        class="input input-bordered"
        required
        @input="autoSlug"
      />
    </div>

    <!-- Slug -->
    <div class="form-control">
      <label class="label">
        <span class="label-text font-medium">Slug</span>
        <span class="label-text-alt text-base-content/50">Se genera automáticamente del título</span>
      </label>
      <div class="input-group">
        <span class="bg-base-200 px-3 flex items-center text-sm text-base-content/50 border border-base-300 rounded-l-lg">
          {{ parentPath ?? "" }}/
        </span>
        <input v-model="form.slug" type="text" class="input input-bordered rounded-l-none flex-1" />
      </div>
    </div>

    <!-- Dynamic fields from content type schema -->
    <template v-for="field in fieldSchema" :key="field.key">
      <div class="form-control">
        <label class="label">
          <span class="label-text font-medium">
            {{ field.label }}
            <span v-if="field.required" class="text-error ml-1">*</span>
          </span>
        </label>

        <input
          v-if="field.type === 'text' || field.type === 'number' || field.type === 'date'"
          v-model="form.fields[field.key]"
          :type="field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'"
          class="input input-bordered"
          :required="field.required"
        />

        <textarea
          v-else-if="field.type === 'textarea'"
          v-model="form.fields[field.key]"
          class="textarea textarea-bordered"
          rows="4"
          :required="field.required"
        />

        <select
          v-else-if="field.type === 'select'"
          v-model="form.fields[field.key]"
          class="select select-bordered"
          :required="field.required"
        >
          <option value="">Seleccionar...</option>
          <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
        </select>

        <div v-else-if="field.type === 'richtext'" class="border border-base-300 rounded-lg overflow-hidden">
          <div ref="editorRefs" :data-field="field.key" class="min-h-40 p-3 prose prose-sm max-w-none" contenteditable="true" />
        </div>

        <p v-else class="text-sm text-base-content/40 italic">
          Campo tipo "{{ field.type }}" — implementación pendiente
        </p>
      </div>
    </template>

    <!-- SEO accordion -->
    <div class="collapse collapse-arrow border border-base-300 rounded-lg">
      <input type="checkbox" />
      <div class="collapse-title font-medium">SEO</div>
      <div class="collapse-content flex flex-col gap-4">
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
    <div class="flex items-center gap-4 pt-2">
      <select v-model="form.status" class="select select-bordered w-40">
        <option value="draft">Borrador</option>
        <option value="published">Publicado</option>
        <option value="scheduled">Programado</option>
      </select>

      <button type="submit" class="btn btn-primary" :disabled="saving">
        <span v-if="saving" class="loading loading-spinner loading-sm"></span>
        {{ nodeId ? "Guardar cambios" : "Crear nodo" }}
      </button>

      <span v-if="successMsg" class="text-success text-sm">{{ successMsg }}</span>
      <span v-if="errorMsg" class="text-error text-sm">{{ errorMsg }}</span>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { actions } from "astro:actions";

interface FieldDefinition {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

const props = defineProps<{
  nodeId?: string;
  contentTypeId: string;
  fieldSchema: FieldDefinition[];
  parentPath?: string;
  initialData?: {
    title?: string;
    slug?: string;
    fields?: Record<string, unknown>;
    seo?: Record<string, unknown>;
    status?: string;
  };
}>();

const emit = defineEmits<{
  saved: [id: string];
}>();

const saving = ref(false);
const successMsg = ref("");
const errorMsg = ref("");
const slugTouched = ref(false);

const form = reactive({
  title: props.initialData?.title ?? "",
  slug: props.initialData?.slug ?? "",
  fields: reactive<Record<string, unknown>>(
    Object.fromEntries(props.fieldSchema.map((f) => [f.key, props.initialData?.fields?.[f.key] ?? ""]))
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
  if (!slugTouched.value) {
    form.slug = slugify(form.title);
  }
}

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
  form.slug = props.initialData?.slug ?? slugify(form.title);
});
</script>
