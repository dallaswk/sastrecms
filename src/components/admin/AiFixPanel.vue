<template>
  <div class="flex flex-col gap-4">
    <!-- Sin IA configurada no hay nada que hacer aquí, y decirlo es más útil que un botón muerto -->
    <div v-if="missing.length" class="panel">
      <div class="panel-body">
        <p class="admin-h2">La IA no está configurada</p>
        <p class="admin-hint">
          Falta {{ missing.join(" y ") }}. Ponlo en
          <a href="/admin/settings" class="link">Ajustes → Inteligencia artificial</a> y vuelve.
        </p>
      </div>
    </div>

    <template v-else>
      <div v-if="!items.length" class="empty-state">
        <strong>No queda nada por redactar</strong>
        <p>{{ doneLabel }}</p>
      </div>

      <template v-else>
        <div class="flex items-center gap-3 flex-wrap">
          <p class="admin-hint !max-w-none">
            {{ pending.length }} pendiente(s) de {{ items.length }}.
            La IA propone y tú decides: nada se guarda hasta que aceptes.
          </p>
          <button
            v-if="pending.length > 1"
            type="button"
            class="btn btn-sm btn-ghost border border-base-300 ml-auto"
            :disabled="busyAll"
            @click="proposeAll"
          >{{ busyAll ? "Generando…" : "Proponer todas" }}</button>
        </div>

        <div v-for="item in items" :key="item.id" class="panel">
          <div class="panel-body">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div class="flex flex-col gap-0.5 min-w-0">
                <span class="admin-h2">{{ item.title || item.filename }}</span>
                <code class="text-xs text-base-content/50">{{ item.path ?? item.url }}</code>
              </div>

              <span v-if="state[item.id]?.saved" class="badge badge-success badge-sm shrink-0">
                guardado
              </span>
              <span v-else-if="state[item.id]?.skipped" class="badge badge-ghost badge-sm shrink-0">
                saltado
              </span>
            </div>

            <!-- Lo que el modelo va a saber. Una propuesta que no puedes explicar no la puedes juzgar -->
            <details v-if="contextOf(item)" class="text-xs">
              <summary class="cursor-pointer text-base-content/50">Qué se le cuenta a la IA</summary>
              <pre class="mt-2 whitespace-pre-wrap rounded-lg bg-base-200 p-2 text-base-content/70">{{ contextOf(item) }}</pre>
            </details>

            <template v-if="state[item.id]?.saved">
              <p class="text-sm">{{ state[item.id]!.value }}</p>
            </template>

            <template v-else-if="state[item.id]?.declined">
              <p class="text-sm text-warning">
                La IA dice que con el nombre del archivo no puede saber qué se ve. Descríbela tú:
              </p>
              <textarea
                v-model="state[item.id]!.value"
                rows="2"
                class="textarea textarea-bordered text-sm"
                :placeholder="'Qué se ve en la imagen'"
              />
              <div class="flex items-center gap-2 flex-wrap">
                <button class="btn btn-sm btn-primary" :disabled="!state[item.id]!.value.trim()" @click="accept(item)">
                  Guardar
                </button>
                <button class="btn btn-sm btn-ghost" @click="skip(item)">Saltar</button>
              </div>
            </template>

            <template v-else-if="state[item.id]?.value">
              <textarea
                v-model="state[item.id]!.value"
                rows="3"
                class="textarea textarea-bordered text-sm"
                @input="recount(item.id)"
              />

              <div class="flex items-center gap-3 flex-wrap text-xs">
                <span :class="countClass(item.id)">
                  {{ state[item.id]!.value.length }} / {{ limits.ideal }} caracteres
                </span>
                <span
                  v-for="warning in state[item.id]!.warnings"
                  :key="warning"
                  class="text-warning"
                >{{ warning }}</span>
                <span
                  v-for="error in state[item.id]!.errors"
                  :key="error"
                  class="text-error"
                >{{ error }}</span>
              </div>

              <div class="flex items-center gap-2 flex-wrap">
                <button
                  class="btn btn-sm btn-primary"
                  :disabled="!canAccept(item.id)"
                  @click="accept(item)"
                >Aceptar y guardar</button>
                <button
                  class="btn btn-sm btn-ghost border border-base-300"
                  :disabled="state[item.id]!.busy"
                  @click="propose(item)"
                >{{ state[item.id]!.busy ? "Generando…" : "Regenerar" }}</button>
                <button class="btn btn-sm btn-ghost" @click="skip(item)">Saltar</button>

                <input
                  v-model="state[item.id]!.instruction"
                  type="text"
                  class="input input-bordered input-sm flex-1 min-w-48"
                  placeholder="Instrucción para regenerar: «más corta», «menciona el precio»"
                  @keyup.enter="propose(item)"
                />
              </div>
            </template>

            <template v-else-if="state[item.id]?.hintRequired">
              <p class="text-sm text-warning">{{ state[item.id]!.hintReason }}</p>
              <div class="flex items-center gap-2 flex-wrap">
                <input
                  v-model="state[item.id]!.instruction"
                  type="text"
                  class="input input-bordered input-sm flex-1 min-w-64"
                  placeholder="De qué va esta página, en una línea"
                  @keyup.enter="propose(item)"
                />
                <button
                  class="btn btn-sm btn-primary"
                  :disabled="!state[item.id]!.instruction.trim() || state[item.id]!.busy"
                  @click="propose(item)"
                >{{ state[item.id]!.busy ? "Generando…" : "Proponer" }}</button>
                <button class="btn btn-sm btn-ghost" @click="skip(item)">Saltar</button>
              </div>
            </template>

            <template v-else>
              <button
                class="btn btn-sm btn-primary self-start"
                :disabled="state[item.id]?.busy"
                @click="propose(item)"
              >{{ state[item.id]?.busy ? "Generando…" : "Proponer" }}</button>
            </template>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { actions } from "astro:actions";
import { notify } from "@/scripts/notify";

/**
 * The AI proposal panel.
 *
 * One row per item, and every row goes proposal → edit → accept. Nothing is written by
 * generating: `accept` is a separate call carrying whatever is in the textarea, so what lands in
 * the database is exactly what was on screen.
 *
 * «Proponer todas» generates them all but still saves nothing — it is a way to see nine
 * proposals at once and accept the seven that are right, not a way to skip reading them.
 */

type Item = {
  id: string;
  title?: string;
  path?: string;
  filename?: string;
  url?: string;
  content?: string;
  usedOn?: string[];
  siblings?: string[];
};

const props = defineProps<{
  task: string;
  items: string;
  missing: string;
  limits: string;
  siteContext: string;
}>();

const items = ref<Item[]>(JSON.parse(props.items));
const missing = JSON.parse(props.missing) as string[];
const limits = JSON.parse(props.limits) as { min: number; ideal: number; max: number };
const site = JSON.parse(props.siteContext) as { siteName: string; tagline?: string };

type RowState = {
  value: string;
  errors: string[];
  warnings: string[];
  busy: boolean;
  saved: boolean;
  skipped: boolean;
  declined: boolean;
  instruction: string;
  hintRequired: boolean;
  hintReason: string;
};

const state = reactive<Record<string, RowState>>({});
const busyAll = ref(false);

function ensure(id: string): RowState {
  state[id] ??= {
    value: "",
    errors: [],
    warnings: [],
    busy: false,
    saved: false,
    skipped: false,
    declined: false,
    instruction: "",
    hintRequired: false,
    hintReason: "",
  };
  return state[id]!;
}
for (const item of items.value) ensure(item.id);

const pending = computed(() =>
  items.value.filter((item) => !state[item.id]?.saved && !state[item.id]?.skipped)
);

const doneLabel = computed(() =>
  props.task === "alt"
    ? "Todas las imágenes tienen texto alternativo."
    : "Todas las páginas publicadas tienen descripción."
);

/** What the model is told, shown so a proposal can be judged rather than just accepted. */
function contextOf(item: Item): string {
  const lines: string[] = [`Sitio: ${site.siteName}`];
  if (site.tagline) lines.push(`Lema: ${site.tagline}`);
  if (item.content?.trim()) lines.push("", "Texto de la página:", item.content.slice(0, 400));
  if (item.usedOn?.length) lines.push("", `Se usa en: ${item.usedOn.join(", ")}`);
  if (item.filename) lines.push(`Archivo: ${item.filename}`);
  if (!item.content?.trim() && !item.usedOn?.length && !item.filename) {
    lines.push("", "La página no tiene texto: la IA sólo cuenta con su título y el del sitio.");
  }
  return lines.join("\n");
}

function recount(id: string) {
  const row = ensure(id);
  const length = row.value.trim().length;
  row.errors = length > limits.max ? [`${length} caracteres: pasa del máximo de ${limits.max}.`] : [];
  row.warnings = [];
  if (length > 0 && length < limits.min) {
    row.warnings.push(`Sólo ${length} caracteres: se queda corto.`);
  }
}

function countClass(id: string) {
  const length = state[id]?.value.trim().length ?? 0;
  if (length > limits.max) return "text-error font-medium";
  if (length > limits.ideal) return "text-warning";
  return "text-base-content/50";
}

function canAccept(id: string): boolean {
  const row = state[id];
  return !!row && !!row.value.trim() && row.errors.length === 0 && !row.busy;
}

async function propose(item: Item) {
  const row = ensure(item.id);
  row.busy = true;

  const { data, error } = await actions.aiFix.propose({
    task: props.task as never,
    itemId: item.id,
    ...(row.instruction.trim() ? { instruction: row.instruction.trim() } : {}),
  });

  row.busy = false;

  if (error) return notify.fromError(error, "No se ha podido generar.");

  if (!data?.ok) {
    // A page with no text needs a hint before the model is asked, or it invents the sector.
    // Shown in the row rather than as a toast: it is a request for input, not a failure.
    if ("needsHint" in data! && data.needsHint) {
      row.hintRequired = true;
      row.hintReason = data.reason;
      return;
    }
    return notify.error(data?.reason ?? "No se ha podido generar.");
  }

  if (data.declined) {
    row.declined = true;
    row.value = "";
    return;
  }

  row.value = data.value;
  row.errors = [...data.errors];
  row.warnings = [...data.warnings];
}

/** Generates every pending one. Still saves nothing. */
async function proposeAll() {
  busyAll.value = true;
  for (const item of pending.value) {
    if (state[item.id]?.value) continue;
    await propose(item);
  }
  busyAll.value = false;
}

async function accept(item: Item) {
  const row = ensure(item.id);
  const value = row.value.trim();
  if (!value) return;

  row.busy = true;
  const { error } = await actions.aiFix.accept({
    task: props.task as never,
    itemId: item.id,
    value,
  });
  row.busy = false;

  if (error) return notify.fromError(error, "No se ha podido guardar.");

  row.saved = true;
  row.value = value;
  notify.success(`Guardado en ${item.path ?? item.filename}.`);
}

function skip(item: Item) {
  ensure(item.id).skipped = true;
}
</script>
