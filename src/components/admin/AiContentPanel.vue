<template>
  <div class="flex flex-col gap-4">
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
      <div v-if="!items.length && !notComposable.length" class="empty-state">
        <strong>No hay páginas vacías</strong>
        <p>Todas las páginas publicadas muestran algo.</p>
      </div>

      <!--
        Empty, but not composable: their type has no sections field, so there are no blocks to
        propose. Listed rather than offered, because a button that always fails is worse than
        no button.
      -->
      <div v-if="notComposable.length" class="panel">
        <div class="panel-body">
          <p class="admin-h2">{{ notComposable.length }} página(s) vacías que no se componen con bloques</p>
          <p class="admin-hint">
            Su tipo de contenido no tiene constructor de páginas, así que hay que escribir su
            texto en el editor. La IA no puede montarlas.
          </p>
          <ul class="data-list rounded-lg border border-base-300">
            <li v-for="page in notComposable" :key="page.path" class="flex items-center gap-3 px-3 py-2">
              <span class="text-sm flex-1 min-w-0 truncate">{{ page.title }}</span>
              <code class="text-xs text-base-content/50">{{ page.path }}</code>
              <span class="badge badge-ghost badge-sm">{{ page.type }}</span>
            </li>
          </ul>
        </div>
      </div>

      <template v-if="items.length">
        <p class="admin-hint !max-w-none">
          {{ pending.length }} página(s) publicada(s) que no muestran nada. La IA propone los
          bloques; tú los revisas antes de que se guarde nada. Bloques disponibles:
          {{ sectionLabels.join(", ") }}.
        </p>

        <div v-for="item in items" :key="item.id" class="panel">
          <div class="panel-body">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div class="flex min-w-0 flex-col gap-0.5">
                <span class="admin-h2">{{ item.title }}</span>
                <code class="text-xs text-base-content/50">{{ item.path }}</code>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <a
                  :href="`/admin/content/${item.id}`"
                  class="btn btn-xs btn-ghost border border-base-300"
                >Abrir en el editor</a>
                <span v-if="state[item.id]?.saved" class="badge badge-success badge-sm">añadido</span>
                <span v-else-if="state[item.id]?.skipped" class="badge badge-ghost badge-sm">saltado</span>
              </div>
            </div>

            <template v-if="state[item.id]?.saved">
              <p class="text-sm text-base-content/70">
                {{ state[item.id]!.savedNote }}
              </p>
            </template>

            <template v-else-if="!state[item.id]?.blocks.length">
              <!--
                The hint is mandatory here, not a nicety. With only a title the model invents the
                sector, and at this volume that is four paragraphs about a different business.
              -->
              <label class="field">
                <span class="field-label">De qué va esta página</span>
                <textarea
                  v-model="state[item.id]!.hint"
                  rows="3"
                  class="textarea textarea-bordered text-sm"
                  placeholder="Qué se ofrece, a quién, y qué la hace distinta. Cuanto más concreto, menos se inventa."
                />
                <span class="field-hint">
                  Obligatorio: sin esto la IA se inventaría el sector y el resultado sonaría bien
                  y sería falso.
                </span>
              </label>

              <div class="flex items-center gap-2">
                <button
                  class="btn btn-sm btn-primary"
                  :disabled="!canPropose(item.id)"
                  @click="propose(item)"
                >{{ state[item.id]!.busy ? "Componiendo…" : "Proponer la página" }}</button>
                <button class="btn btn-sm btn-ghost" @click="skip(item)">Saltar</button>
                <span v-if="state[item.id]!.busy" class="text-xs text-base-content/50">
                  Puede tardar unos segundos: son varios bloques.
                </span>
              </div>
            </template>

            <template v-else>
              <!-- The review. Types and their main text, because that is the decision. -->
              <ol class="data-list rounded-lg border border-base-300">
                <li
                  v-for="(block, index) in state[item.id]!.summary"
                  :key="index"
                  class="flex items-start gap-3 px-3 py-2"
                >
                  <span class="badge badge-ghost badge-sm shrink-0 tabular">{{ index + 1 }}</span>
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <span class="text-xs font-medium text-base-content/60">{{ block.label }}</span>
                    <span class="text-sm">{{ block.text || "—" }}</span>
                  </div>
                </li>
              </ol>

              <div v-if="state[item.id]!.issues.length" class="text-xs text-warning flex flex-col gap-0.5">
                <span
                  v-for="issue in state[item.id]!.issues"
                  :key="issue.index + issue.message"
                >Bloque {{ issue.index + 1 }}: {{ issue.message }}</span>
              </div>

              <details class="text-xs">
                <summary class="cursor-pointer text-base-content/50">Ver el JSON</summary>
                <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-base-200 p-2">{{ JSON.stringify(state[item.id]!.blocks, null, 2) }}</pre>
              </details>

              <div class="flex flex-wrap items-center gap-2">
                <button
                  class="btn btn-sm btn-primary"
                  :disabled="state[item.id]!.busy"
                  @click="accept(item)"
                >Añadir {{ state[item.id]!.blocks.length }} bloque(s)</button>
                <button
                  class="btn btn-sm btn-ghost border border-base-300"
                  :disabled="state[item.id]!.busy"
                  @click="propose(item)"
                >{{ state[item.id]!.busy ? "Componiendo…" : "Volver a proponer" }}</button>
                <button class="btn btn-sm btn-ghost" @click="discard(item)">Descartar</button>
              </div>

              <p class="text-xs text-base-content/50">
                Se añaden al final de la página y, si estaba publicada, pasa a borrador: cuatro
                párrafos que nadie ha leído no deberían salir en directo.
              </p>
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
 * Composing a page with the AI.
 *
 * The review step is different from the description panel's, and deliberately so: reading one
 * sentence is a glance, deciding whether six blocks say the right thing is not. So the proposal
 * is shown as a numbered list of blocks with each one's main text, the raw JSON is one click
 * away for anybody who wants it, and whatever the parser had to drop is listed rather than
 * hidden.
 */

type Item = { id: string; title: string; path: string };
type Summary = { type: string; label: string; text: string };
type Issue = { index: number; type?: string; message: string };

const props = defineProps<{
  items: string;
  missing: string;
  sectionLabels: string;
  /** Empty pages whose type cannot hold blocks. Listed, not offered. */
  notComposable: string;
}>();

const items = ref<Item[]>(JSON.parse(props.items));
const missing = JSON.parse(props.missing) as string[];
const sectionLabels = JSON.parse(props.sectionLabels) as string[];
const notComposable = JSON.parse(props.notComposable) as { path: string; title: string; type: string }[];

type RowState = {
  hint: string;
  busy: boolean;
  blocks: Record<string, unknown>[];
  summary: Summary[];
  issues: Issue[];
  saved: boolean;
  savedNote: string;
  skipped: boolean;
};

const state = reactive<Record<string, RowState>>({});
for (const item of items.value) {
  state[item.id] = {
    hint: "",
    busy: false,
    blocks: [],
    summary: [],
    issues: [],
    saved: false,
    savedNote: "",
    skipped: false,
  };
}

const pending = computed(() =>
  items.value.filter((item) => !state[item.id]?.saved && !state[item.id]?.skipped)
);

function canPropose(id: string): boolean {
  const row = state[id];
  // Ten characters is the action's own minimum: matching it here means the button is disabled
  // rather than the request being rejected after the wait.
  return !!row && row.hint.trim().length >= 10 && !row.busy;
}

async function propose(item: Item) {
  const row = state[item.id]!;
  row.busy = true;

  const { data, error } = await actions.aiFix.proposeContent({
    nodeId: item.id,
    hint: row.hint.trim(),
  });

  row.busy = false;

  if (error) return notify.fromError(error, "No se ha podido componer.");
  if (!data?.ok) return notify.error(data?.reason ?? "No se ha podido componer.");

  row.blocks = data.blocks as unknown as Record<string, unknown>[];
  row.summary = data.summary as Summary[];
  row.issues = data.issues as Issue[];

  if (data.attempts > 1) {
    notify.info("Ha hecho falta un segundo intento: el primero devolvió bloques inválidos.");
  }
}

async function accept(item: Item) {
  const row = state[item.id]!;
  row.busy = true;

  const { data, error } = await actions.aiFix.acceptContent({
    nodeId: item.id,
    blocks: row.blocks,
  });

  row.busy = false;

  if (error) return notify.fromError(error, "No se ha podido guardar.");

  row.saved = true;
  row.savedNote = data!.unpublished
    ? `${data!.added} bloque(s) añadidos. La página ha pasado a borrador: revísala y publícala.`
    : `${data!.added} bloque(s) añadidos al borrador.`;
  notify.success(`Bloques añadidos a ${data!.path}.`);
}

function discard(item: Item) {
  const row = state[item.id]!;
  row.blocks = [];
  row.summary = [];
  row.issues = [];
}

function skip(item: Item) {
  state[item.id]!.skipped = true;
}
</script>
