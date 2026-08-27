<template>
  <div class="flex flex-col gap-2">
    <p v-if="field.help" class="text-xs text-base-content/50">{{ field.help }}</p>

    <div v-for="problem in formIssues" :key="problem" class="alert alert-warning text-sm py-2">
      <span>{{ problem }}</span>
    </div>

    <VueDraggable
      v-if="rows.length"
      v-model="rows"
      :group="{ name: `formfields-${path}` }"
      :animation="150"
      :disabled="disabled"
      :force-fallback="true"
      :fallback-tolerance="3"
      handle=".field-handle"
      class="flex flex-col gap-2"
      @end="commit"
    >
      <div
        v-for="(row, index) in rows"
        :key="row._lid"
        class="border rounded-lg bg-base-100"
        :class="problems[index].length ? 'border-warning' : 'border-base-300'"
      >
        <div class="flex items-center gap-2 p-2">
          <span class="field-handle cursor-grab select-none px-1 text-base-content/40" aria-hidden="true">⠿</span>

          <button type="button" class="flex-1 text-left min-w-0 flex items-center gap-2 flex-wrap" @click="toggle(row._lid)">
            <span class="font-medium">{{ row.label || "Campo sin etiqueta" }}</span>
            <code class="text-xs text-base-content/50">{{ row.key || "sin_clave" }}</code>
            <span class="badge badge-ghost badge-sm">{{ typeLabel(row.type) }}</span>
            <span v-if="row.required === 'sí'" class="badge badge-sm">obligatorio</span>
            <span v-if="row.width === 'half'" class="badge badge-ghost badge-sm">media anchura</span>
            <span v-if="problems[index].length" class="badge badge-warning badge-sm">
              {{ problems[index].length }} aviso(s)
            </span>
          </button>

          <button
            type="button"
            class="btn btn-xs btn-ghost"
            :disabled="disabled"
            title="Duplicar"
            @click="duplicate(index)"
          >⧉</button>
          <button
            type="button"
            class="btn btn-xs btn-ghost text-error"
            :disabled="disabled"
            :title="`Quitar ${row.label || 'campo'}`"
            @click="remove(index)"
          >✕</button>
        </div>

        <div v-if="open === row._lid" class="border-t border-base-300 p-3 flex flex-col gap-3">
          <ul v-if="problems[index].length" class="text-sm text-warning flex flex-col gap-1">
            <li v-for="problem in problems[index]" :key="problem">· {{ problem }}</li>
          </ul>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="form-control">
              <span class="label-text text-xs">Etiqueta visible</span>
              <input v-model="row.label" type="text" class="input input-bordered input-sm"
                     :disabled="disabled" @blur="fillKey(row)" @input="commit" />
            </label>

            <label class="form-control">
              <span class="label-text text-xs">
                Clave
                <span v-if="storedKeys.has(row.key)" class="text-warning">· ya tiene respuestas</span>
              </span>
              <input v-model="row.key" type="text" class="input input-bordered input-sm font-mono"
                     :disabled="disabled" @input="commit" />
              <span v-if="storedKeys.has(row.key)" class="text-xs text-warning mt-1">
                Cambiarla desliga las respuestas ya recibidas: seguirán en la bandeja con la
                clave antigua.
              </span>
            </label>

            <label class="form-control">
              <span class="label-text text-xs">Tipo</span>
              <select v-model="row.type" class="select select-bordered select-sm"
                      :disabled="disabled" @change="onTypeChange(row)">
                <option v-for="option in TYPE_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <div class="grid grid-cols-2 gap-3">
              <label class="form-control">
                <span class="label-text text-xs">Obligatorio</span>
                <select v-model="row.required" class="select select-bordered select-sm" :disabled="disabled" @change="commit">
                  <option value="no">No</option>
                  <option value="sí">Sí</option>
                </select>
              </label>
              <label class="form-control">
                <span class="label-text text-xs">Anchura</span>
                <select v-model="row.width" class="select select-bordered select-sm" :disabled="disabled" @change="commit">
                  <option value="full">Completa</option>
                  <option value="half">Media</option>
                </select>
              </label>
            </div>
          </div>

          <label v-if="caps(row).options" class="form-control">
            <span class="label-text text-xs">Opciones, una por línea</span>
            <textarea v-model="row.options" rows="4" class="textarea textarea-bordered textarea-sm font-mono"
                      :disabled="disabled" @input="commit" />
          </label>

          <div class="grid gap-3 sm:grid-cols-2">
            <label v-if="caps(row).placeholder" class="form-control">
              <span class="label-text text-xs">Texto de ejemplo dentro del campo</span>
              <input v-model="row.placeholder" type="text" class="input input-bordered input-sm"
                     :disabled="disabled" @input="commit" />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">Texto de ayuda, bajo el campo</span>
              <input v-model="row.help" type="text" class="input input-bordered input-sm"
                     :disabled="disabled" @input="commit" />
            </label>
          </div>

          <details class="rounded-lg bg-base-200/40 px-3 py-2" :open="hasRules(row)">
            <summary class="cursor-pointer text-sm font-medium">Validación</summary>

            <div class="pt-3 flex flex-col gap-3">
              <div v-if="caps(row).length" class="grid grid-cols-2 gap-3">
                <label class="form-control">
                  <span class="label-text text-xs">Mínimo de caracteres</span>
                  <input v-model="row.minLength" type="number" min="0" class="input input-bordered input-sm"
                         :disabled="disabled" @input="commit" />
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">Máximo de caracteres</span>
                  <input v-model="row.maxLength" type="number" min="0" class="input input-bordered input-sm"
                         :disabled="disabled" @input="commit" />
                </label>
              </div>

              <div v-if="caps(row).range" class="grid grid-cols-2 gap-3">
                <label class="form-control">
                  <span class="label-text text-xs">{{ row.type === "date" ? "Fecha mínima" : "Valor mínimo" }}</span>
                  <input v-model="row.min" :type="row.type === 'date' ? 'date' : 'number'"
                         class="input input-bordered input-sm" :disabled="disabled" @input="commit" />
                </label>
                <label class="form-control">
                  <span class="label-text text-xs">{{ row.type === "date" ? "Fecha máxima" : "Valor máximo" }}</span>
                  <input v-model="row.max" :type="row.type === 'date' ? 'date' : 'number'"
                         class="input input-bordered input-sm" :disabled="disabled" @input="commit" />
                </label>
              </div>

              <label v-if="caps(row).pattern" class="form-control">
                <span class="label-text text-xs">Formato</span>
                <select v-model="row.pattern" class="select select-bordered select-sm" :disabled="disabled" @change="commit">
                  <option value="">Cualquiera</option>
                  <option v-for="name in PATTERN_NAMES" :key="name" :value="name">
                    {{ FIELD_PATTERNS[name].label }}
                  </option>
                </select>
                <span v-if="row.pattern" class="text-xs text-base-content/50 mt-1">
                  Ejemplo válido: <code>{{ FIELD_PATTERNS[row.pattern as PatternName].placeholder || "—" }}</code>
                </span>
              </label>

              <label class="form-control">
                <span class="label-text text-xs">Mensaje de error propio</span>
                <input v-model="row.message" type="text" class="input input-bordered input-sm"
                       :disabled="disabled" placeholder="Vacío usa el mensaje por defecto"
                       @input="commit" />
              </label>

              <p v-if="!hasAnyRuleSlot(row)" class="text-xs text-base-content/50">
                Este tipo de campo no admite más reglas que «obligatorio»: lo que valida es su
                propio formato.
              </p>
            </div>
          </details>
        </div>
      </div>
    </VueDraggable>

    <p v-else class="text-sm text-base-content/50 border border-dashed border-base-300 rounded-lg px-3 py-6 text-center">
      El formulario no tiene campos todavía.
    </p>

    <div class="flex gap-2 flex-wrap">
      <button type="button" class="btn btn-sm btn-ghost border border-base-300" :disabled="disabled" @click="add()">
        + Añadir campo
      </button>
      <button
        v-for="preset in QUICK_FIELDS"
        :key="preset.key"
        type="button"
        class="btn btn-sm btn-ghost"
        :disabled="disabled || rows.some((r) => r.key === preset.key)"
        @click="addPreset(preset)"
      >+ {{ preset.label }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import type { FieldDefinition } from "@lib/fields/types";
import { FIELD_PATTERNS, PATTERN_NAMES, FORM_FIELD_LABELS, type FormFieldType, type PatternName } from "@lib/forms/types";
import {
  TYPE_OPTIONS,
  capabilitiesOf,
  emptyRow,
  formProblems,
  fromRow,
  keyFromLabel,
  problemsOf,
  toRow,
  type FormFieldRow,
} from "./formFieldRow";
import { addItem, duplicateItem, removeItem } from "./itemList";

const props = defineProps<{
  field: FieldDefinition;
  modelValue: unknown;
  path: string;
  disabled?: boolean;
  errors?: Record<string, string>;
}>();

const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

let counter = 0;
const lid = () => `ffl_${++counter}`;

const rows = ref<FormFieldRow[]>(
  (Array.isArray(props.modelValue) ? props.modelValue : []).map((raw) => toRow(raw, lid()))
);

/**
 * The keys the form already had when the editor opened.
 *
 * Used only to warn: those are the keys under which answers are already sitting in the
 * inbox, and renaming one leaves them behind under the old name.
 */
const storedKeys = new Set(rows.value.map((row) => row.key).filter(Boolean));

const open = ref<string | null>(null);

const problems = computed(() => rows.value.map((row) => problemsOf(row, rows.value)));
const formIssues = computed(() => formProblems(rows.value));

function typeLabel(type: FormFieldType) {
  return FORM_FIELD_LABELS[type] ?? type;
}
function caps(row: FormFieldRow) {
  return capabilitiesOf(row.type);
}
function hasAnyRuleSlot(row: FormFieldRow) {
  const c = capabilitiesOf(row.type);
  return c.length || c.range || c.pattern;
}
function hasRules(row: FormFieldRow) {
  return !!(row.minLength || row.maxLength || row.min || row.max || row.pattern || row.message);
}

function toggle(id: string) {
  open.value = open.value === id ? null : id;
}

function commit() {
  emit("update:modelValue", rows.value.map(fromRow));
}

/** Only ever fills an empty key: an existing one is what the stored answers hang off. */
function fillKey(row: FormFieldRow) {
  if (!row.key.trim() && row.label.trim()) {
    const base = keyFromLabel(row.label);
    let candidate = base || "campo";
    let n = 2;
    while (rows.value.some((other) => other !== row && other.key === candidate)) {
      candidate = `${base}_${n++}`;
    }
    row.key = candidate;
  }
  commit();
}

/** Clears the rules the new type cannot enforce, so nothing invisible is left behind. */
function onTypeChange(row: FormFieldRow) {
  const c = capabilitiesOf(row.type);
  if (!c.options) row.options = "";
  if (!c.length) {
    row.minLength = "";
    row.maxLength = "";
  }
  if (!c.range) {
    row.min = "";
    row.max = "";
  }
  if (!c.pattern) row.pattern = "";
  if (!c.placeholder) row.placeholder = "";
  commit();
}

function add(row?: Partial<FormFieldRow>) {
  const created = { ...emptyRow(lid()), ...row };
  rows.value = addItem(rows.value, created);
  open.value = created._lid;
  commit();
}

const QUICK_FIELDS: (Partial<FormFieldRow> & { key: string; label: string })[] = [
  { key: "nombre", label: "Nombre", type: "text", required: "sí", width: "half" },
  { key: "email", label: "Correo electrónico", type: "email", required: "sí", width: "half" },
  { key: "telefono", label: "Teléfono", type: "tel", width: "half" },
  { key: "mensaje", label: "Mensaje", type: "textarea", required: "sí" },
  { key: "empresa", label: "Empresa", type: "text", width: "half" },
  { key: "nif", label: "NIF", type: "text", width: "half", pattern: "nif" },
  { key: "codigo_postal", label: "Código postal", type: "text", width: "half", pattern: "codigo_postal" },
  { key: "fecha", label: "Fecha preferida", type: "date", width: "half" },
];

function addPreset(preset: Partial<FormFieldRow>) {
  add(preset);
}

function duplicate(index: number) {
  const next = duplicateItem(rows.value, index);
  // The copy needs its own key and its own local id, or it is dropped as a duplicate.
  const copy = next[index + 1];
  copy._lid = lid();
  copy.key = `${copy.key}_copia`;
  rows.value = next;
  open.value = copy._lid;
  commit();
}

function remove(index: number) {
  const row = rows.value[index];
  if (
    storedKeys.has(row.key) &&
    !confirm(
      `«${row.label || row.key}» ya tiene respuestas en la bandeja. Quitarlo del formulario ` +
        "no las borra, pero deja de pedirlo. ¿Continuar?"
    )
  ) {
    return;
  }
  rows.value = removeItem(rows.value, index);
  commit();
}

// A section can be replaced wholesale from outside — undoing a change, or an agent writing
// the whole block — and the editor has to follow rather than keep its own stale copy.
watch(
  () => props.modelValue,
  (value) => {
    const incoming = JSON.stringify(Array.isArray(value) ? value : []);
    if (incoming === JSON.stringify(rows.value.map(fromRow))) return;
    rows.value = (Array.isArray(value) ? value : []).map((raw) => toRow(raw, lid()));
  }
);
</script>
