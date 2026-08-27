<template>
  <div class="flex flex-col gap-8 max-w-3xl">
    <!-- Basic info -->
    <section class="card bg-base-100 border border-base-300">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">Información básica</h2>

        <div class="grid grid-cols-2 gap-4">
          <div class="form-control">
            <label class="label"><span class="label-text font-medium">Clave interna *</span></label>
            <input
              v-model="form.key"
              type="text"
              class="input input-bordered font-mono"
              placeholder="mi_tipo"
              :disabled="!!contentTypeId"
              required
            />
            <label class="label">
              <span class="label-text-alt text-base-content/50">Inmutable una vez creada. Solo letras minúsculas, números y _</span>
            </label>
          </div>

          <div class="form-control">
            <label class="label"><span class="label-text font-medium">Etiqueta *</span></label>
            <input v-model="form.label" type="text" class="input input-bordered" placeholder="Mi Tipo" required />
          </div>
        </div>

        <div class="flex gap-6 flex-wrap">
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="form.hasArchive" type="checkbox" class="checkbox checkbox-sm" />
            <span class="label-text">Tiene archivo/listado</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="form.supportsChildren" type="checkbox" class="checkbox checkbox-sm" />
            <span class="label-text">Permite hijos</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="form.translatable" type="checkbox" class="checkbox checkbox-sm" />
            <span class="label-text">Traducible</span>
          </label>
        </div>
      </div>
    </section>

    <!-- Fields -->
    <section class="card bg-base-100 border border-base-300">
      <div class="card-body gap-4">
        <div class="flex justify-between items-center">
          <h2 class="card-title text-base">Campos</h2>
          <button type="button" class="btn btn-sm btn-outline" @click="addField">
            + Añadir campo
          </button>
        </div>

        <div v-if="form.fieldSchema.length === 0" class="text-center py-8 text-base-content/40 text-sm">
          Sin campos todavía. Haz clic en "+ Añadir campo" para empezar.
        </div>

        <div ref="sortableContainer" class="flex flex-col gap-3">
          <div
            v-for="(field, idx) in form.fieldSchema"
            :key="field._id"
            class="border border-base-300 rounded-lg p-4 bg-base-50 cursor-move"
          >
            <div class="flex items-start gap-3">
              <div class="text-base-content/30 mt-1 select-none">⠿</div>

              <div class="flex-1 grid grid-cols-2 gap-3">
                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Tipo</span></label>
                  <select v-model="field.type" class="select select-bordered select-sm">
                    <option v-for="type in FIELD_TYPES" :key="type" :value="type">
                      {{ FIELD_TYPE_LABELS[type] }}
                    </option>
                  </select>
                </div>

                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Etiqueta *</span></label>
                  <input
                    v-model="field.label"
                    type="text"
                    class="input input-bordered input-sm"
                    placeholder="Mi campo"
                    @input="autoKey(field)"
                  />
                </div>

                <div class="form-control">
                  <label class="label py-0"><span class="label-text text-xs">Clave interna *</span></label>
                  <input
                    v-model="field.key"
                    type="text"
                    class="input input-bordered input-sm font-mono"
                    placeholder="mi_campo"
                  />
                </div>

                <div class="form-control flex-row items-center gap-2 pt-5">
                  <input v-model="field.required" type="checkbox" class="checkbox checkbox-sm" />
                  <span class="label-text text-sm">Requerido</span>
                </div>

                <!-- Relation: which content type the target must be -->
                <div v-if="field.type === 'relation'" class="col-span-2 form-control">
                  <label class="label py-0"><span class="label-text text-xs">Tipo de contenido relacionado</span></label>
                  <select v-model="field.relatedContentType" class="select select-bordered select-sm">
                    <option :value="undefined">Cualquiera</option>
                    <option v-for="ct in otherContentTypes" :key="ct.key" :value="ct.key">
                      {{ ct.label }}
                    </option>
                  </select>
                </div>

                <!-- Repeater subfields -->
                <div v-if="field.type === 'repeater'" class="col-span-2 form-control">
                  <label class="label py-0">
                    <span class="label-text text-xs">Subcampos que se repiten</span>
                  </label>
                  <div class="border border-base-300 rounded-lg p-3 flex flex-col gap-2 bg-base-100">
                    <p v-if="!(field.subfields ?? []).length" class="text-xs text-base-content/50">
                      Sin subcampos. El repetidor no se podrá editar hasta que añadas al menos uno.
                    </p>
                    <div
                      v-for="(sub, subIdx) in field.subfields ?? []"
                      :key="subIdx"
                      class="flex gap-2 items-center"
                    >
                      <select v-model="sub.type" class="select select-bordered select-xs w-32">
                        <option v-for="type in SUBFIELD_TYPES" :key="type" :value="type">
                          {{ FIELD_TYPE_LABELS[type] }}
                        </option>
                      </select>
                      <input
                        v-model="sub.label" type="text" placeholder="Etiqueta"
                        class="input input-bordered input-xs flex-1"
                        @input="autoKey(sub)"
                      />
                      <input
                        v-model="sub.key" type="text" placeholder="clave"
                        class="input input-bordered input-xs w-32 font-mono"
                      />
                      <button
                        type="button" class="btn btn-ghost btn-xs text-error"
                        @click="removeSubfield(field, subIdx)"
                      >✕</button>
                    </div>
                    <button
                      type="button" class="btn btn-ghost btn-xs self-start"
                      @click="addSubfield(field)"
                    >+ Subcampo</button>
                  </div>
                </div>

                <!-- Select options -->
                <div v-if="field.type === 'select'" class="col-span-2 form-control">
                  <label class="label py-0"><span class="label-text text-xs">Opciones (separadas por coma)</span></label>
                  <input
                    :value="(field.options ?? []).join(', ')"
                    @input="(e) => field.options = (e.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean)"
                    type="text"
                    class="input input-bordered input-sm"
                    placeholder="opcion1, opcion2, opcion3"
                  />
                </div>
              </div>

              <button
                type="button"
                class="btn btn-ghost btn-sm text-error"
                @click="removeField(idx)"
              >✕</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Submit -->
    <div class="flex gap-3 items-center">
      <button type="button" class="btn btn-primary" :disabled="saving" @click="handleSubmit">
        <span v-if="saving" class="loading loading-spinner loading-sm"></span>
        {{ contentTypeId ? "Guardar cambios" : "Crear tipo" }}
      </button>
      <span v-if="successMsg" class="text-success text-sm">{{ successMsg }}</span>
      <span v-if="errorMsg" class="text-error text-sm">{{ errorMsg }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FIELD_TYPES, FIELD_TYPE_LABELS } from "@lib/fields/types";
import type { FieldType, FieldDefinition } from "@lib/fields/types";
import { ref, reactive, onMounted, computed } from "vue";
import { actions } from "astro:actions";
import Sortable from "sortablejs";

interface Field {
  /** Local only, for :key during drag. Stripped before saving. */
  _id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  relatedContentType?: string;
  subfields?: FieldDefinition[];
  allowedSections?: string[];
}

const props = defineProps<{
  contentTypeId?: string;
  /** Serialised [{key,label}] of the site's content types, for the relation select. */
  contentTypes?: string;
  initialData?: {
    key?: string;
    label?: string;
    hasArchive?: boolean;
    supportsChildren?: boolean;
    translatable?: boolean;
    fieldSchema?: Field[];
  };
}>();

const saving = ref(false);
const successMsg = ref("");
const errorMsg = ref("");
const sortableContainer = ref<HTMLElement | null>(null);

let fieldCounter = 0;
function makeId() { return `f_${++fieldCounter}`; }

const form = reactive({
  key: props.initialData?.key ?? "",
  label: props.initialData?.label ?? "",
  hasArchive: props.initialData?.hasArchive ?? false,
  supportsChildren: props.initialData?.supportsChildren ?? false,
  translatable: props.initialData?.translatable ?? true,
  fieldSchema: reactive<Field[]>(
    (props.initialData?.fieldSchema ?? []).map((f) => ({ ...f, _id: makeId() }))
  ),
});

function slugifyKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function autoKey(field: { key: string; label: string }) {
  if (!field.key || field.key === slugifyKey(field.label.slice(0, -1))) {
    field.key = slugifyKey(field.label);
  }
}

/**
 * Subfields are one level deep on purpose: a repeater inside a repeater is a page
 * builder, and that is what the sections field is for. Keeping the nesting flat here
 * also keeps this editor non-recursive.
 */
const SUBFIELD_TYPES = FIELD_TYPES.filter(
  (t) => t !== "repeater" && t !== "sections" && t !== "relation"
);

const otherContentTypes = computed<{ key: string; label: string }[]>(() => {
  try {
    const parsed = JSON.parse(props.contentTypes ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
});

function addSubfield(field: Field) {
  if (!field.subfields) field.subfields = [];
  field.subfields.push({ key: "", label: "", type: "text" });
}

function removeSubfield(field: Field, idx: number) {
  field.subfields?.splice(idx, 1);
}

function addField() {
  form.fieldSchema.push({
    _id: makeId(),
    key: "",
    label: "",
    type: "text",
    required: false,
  });
}

function removeField(idx: number) {
  form.fieldSchema.splice(idx, 1);
}

async function handleSubmit() {
  saving.value = true;
  errorMsg.value = "";
  successMsg.value = "";

  const schema = form.fieldSchema.map(({ _id, ...f }) => f);

  try {
    if (props.contentTypeId) {
      const { error } = await actions.contentTypes.update({
        id: props.contentTypeId,
        label: form.label,
        hasArchive: form.hasArchive,
        supportsChildren: form.supportsChildren,
        translatable: form.translatable,
        fieldSchema: schema as never,
      });
      if (error) throw new Error(error.message);
      successMsg.value = "Guardado";
    } else {
      const { data, error } = await actions.contentTypes.create({
        key: form.key,
        label: form.label,
        hasArchive: form.hasArchive,
        supportsChildren: form.supportsChildren,
        translatable: form.translatable,
        fieldSchema: schema as never,
      });
      if (error) throw new Error(error.message);
      successMsg.value = "Tipo creado";
      setTimeout(() => {
        window.location.href = `/admin/content-types/${data!.id}`;
      }, 800);
    }
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : "Error desconocido";
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  if (sortableContainer.value) {
    Sortable.create(sortableContainer.value, {
      animation: 150,
      handle: "[data-drag-handle]",
      onEnd(evt) {
        const item = form.fieldSchema.splice(evt.oldIndex!, 1)[0];
        form.fieldSchema.splice(evt.newIndex!, 0, item);
      },
    });
  }
});
</script>
