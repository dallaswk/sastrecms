<template>
  <div class="flex flex-col gap-6">
    <section
      v-for="menu in MENU_SECTIONS"
      :key="menu.key"
      class="card bg-base-100 border border-base-300"
    >
      <div class="card-body gap-3">
        <div>
          <h2 class="card-title text-base">{{ menu.label }}</h2>
          <p class="text-sm text-base-content/60">{{ menu.hint }}</p>
        </div>

        <VueDraggable
          v-if="items[menu.key].length"
          v-model="items[menu.key]"
          :group="{ name: `menu-${menu.key}` }"
          :animation="150"
          :force-fallback="true"
          :fallback-tolerance="3"
          handle=".menu-handle"
          class="flex flex-col gap-2"
        >
          <div
            v-for="(item, index) in items[menu.key]"
            :key="item._lid"
            class="flex gap-2 items-start bg-base-200/40 rounded-lg p-2"
          >
            <span
              class="menu-handle cursor-grab select-none px-1 pt-2 text-base-content/40"
              title="Arrastra para reordenar"
              aria-hidden="true"
            >⠿</span>

            <div class="flex flex-col gap-2 flex-1 min-w-0">
              <div class="flex gap-2 flex-wrap">
                <input
                  v-model="item.label"
                  type="text"
                  class="input input-bordered input-sm w-40"
                  placeholder="Etiqueta"
                  :class="{ 'input-error': !item.label.trim() }"
                />
                <select
                  v-model="item.nodeId"
                  class="select select-bordered select-sm flex-1 min-w-48"
                >
                  <option value="">— enlace externo —</option>
                  <option v-for="page in linkables" :key="page.id" :value="page.id">
                    {{ page.title }} ({{ page.path }})
                  </option>
                </select>
              </div>

              <!-- Hidden rather than disabled when a page is chosen: a URL left visible
                   next to a selected page reads as if both were used. -->
              <input
                v-if="!item.nodeId"
                v-model="item.url"
                type="text"
                class="input input-bordered input-sm font-mono text-xs"
                placeholder="https://… , mailto:… o #ancla"
              />
              <p v-if="rowProblem(item)" class="text-xs text-warning">{{ rowProblem(item) }}</p>
            </div>

            <button
              type="button"
              class="btn btn-xs btn-ghost text-error mt-1"
              :aria-label="`Quitar ${item.label || 'enlace'}`"
              @click="remove(menu.key, index)"
            >✕</button>
          </div>
        </VueDraggable>

        <p
          v-else
          class="text-sm text-base-content/50 border border-dashed border-base-300 rounded-lg px-3 py-5 text-center"
        >
          Sin enlaces. {{ menu.empty }}
        </p>

        <button
          type="button"
          class="btn btn-sm btn-ghost border border-base-300 self-start"
          @click="add(menu.key)"
        >+ Añadir enlace</button>
      </div>
    </section>

    <div class="flex items-center gap-3 sticky bottom-4">
      <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
        {{ saving ? "Guardando…" : "Guardar menús" }}
      </button>
      <span v-if="message" class="text-sm" :class="failed ? 'text-error' : 'text-success'">
        {{ message }}
      </span>
      <span v-else-if="dirty" class="text-sm text-base-content/50">Cambios sin guardar</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { actions } from "astro:actions";
import { MENU_KEYS, MENU_LABELS, readMenu } from "@lib/menus";
import type { MenuItem, MenuKey } from "@lib/menus";
import { addItem, removeItem, withLocalIds, stripLocalIds } from "./fields/itemList";

type Linkable = { id: string; title: string; path: string };
/** `nodeId` and `url` are always strings in the editor so v-model never writes undefined. */
type Row = { _lid: string; label: string; nodeId: string; url: string };

const props = defineProps<{
  /** Serialised, same reason as NodeTree: an object prop does not survive the Astro→Vue boundary reliably. */
  menus: string;
  linkables: string;
}>();

const linkables = JSON.parse(props.linkables) as Linkable[];

const MENU_SECTIONS: { key: MenuKey; label: string; hint: string; empty: string }[] = [
  {
    key: "main",
    label: MENU_LABELS.main,
    hint: "Cabecera del sitio, en todas las páginas.",
    empty: "La cabecera mostrará sólo el logo.",
  },
  {
    key: "footer",
    label: MENU_LABELS.footer,
    hint: "Columna de enlaces del pie.",
    empty: "El pie no mostrará esa columna.",
  },
  {
    key: "legal",
    label: MENU_LABELS.legal,
    hint: "Línea inferior del pie: aviso legal, privacidad, cookies.",
    empty: "Recuerda que estos enlaces son obligatorios en España.",
  },
];

function toRows(stored: unknown, key: MenuKey): Row[] {
  return withLocalIds(
    readMenu(stored, key).map((item: MenuItem) => ({
      label: item.label,
      nodeId: item.nodeId ?? "",
      url: item.url ?? "",
    }))
  );
}

const stored = JSON.parse(props.menus) as unknown;

// One reactive object keyed by menu, so v-model on the draggable list writes straight back.
const items = reactive(
  Object.fromEntries(MENU_KEYS.map((key) => [key, toRows(stored, key)])) as Record<MenuKey, Row[]>
);

const saving = ref(false);
const message = ref("");
const failed = ref(false);
const dirty = ref(false);

const payload = computed(() =>
  Object.fromEntries(
    MENU_KEYS.map((key) => [
      key,
      stripLocalIds(items[key])
        .filter((row) => row.label.trim() !== "")
        // A page wins over a URL, matching normalizeMenus on the server.
        .map((row) =>
          row.nodeId ? { label: row.label.trim(), nodeId: row.nodeId } : { label: row.label.trim(), url: row.url.trim() }
        )
        .filter((row) => "nodeId" in row || row.url !== ""),
    ])
  )
);

watch(
  items,
  () => {
    dirty.value = true;
    message.value = "";
  },
  { deep: true }
);

/** The two ways a row is silently dropped on save, said out loud instead. */
function rowProblem(row: Row): string | null {
  if (!row.label.trim()) return "Sin etiqueta no se guarda.";
  if (!row.nodeId && !row.url.trim()) return "Elige una página o escribe una dirección.";
  return null;
}

function add(key: MenuKey) {
  items[key] = addItem(items[key], withLocalIds([{ label: "", nodeId: "", url: "" }])[0]);
}

function remove(key: MenuKey, index: number) {
  items[key] = removeItem(items[key], index);
}

async function save() {
  saving.value = true;
  message.value = "";
  const { error } = await actions.menus.update({ menus: payload.value });
  saving.value = false;
  failed.value = !!error;
  if (error) {
    message.value = error.message;
    return;
  }
  dirty.value = false;
  message.value = "Menús guardados.";
}
</script>
