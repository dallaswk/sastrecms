<template>
  <div class="flex flex-col gap-3">
    <div v-if="!rows.length" class="empty-state">
      <strong>No hay mensajes que mostrar</strong>
      <p>Cuando alguien escriba por un formulario del sitio, aparecerá aquí.</p>
    </div>

    <template v-else>
      <div class="flex items-center gap-2 flex-wrap text-sm">
        <label class="flex items-center gap-2">
          <input type="checkbox" class="checkbox checkbox-sm" :checked="allSelected" @change="toggleAll" />
          <span class="text-base-content/60">
            {{ selected.size ? `${selected.size} seleccionado(s)` : "Seleccionar todos" }}
          </span>
        </label>

        <template v-if="selected.size">
          <button class="btn btn-xs btn-ghost border border-base-300" :disabled="busy" @click="setStatus('read')">
            Marcar leído
          </button>
          <button class="btn btn-xs btn-ghost border border-base-300" :disabled="busy" @click="setStatus('new')">
            Marcar sin leer
          </button>
          <button class="btn btn-xs btn-ghost border border-base-300" :disabled="busy" @click="setStatus('spam')">
            Marcar spam
          </button>
          <button v-if="canDelete" class="btn btn-xs btn-ghost text-error" :disabled="busy" @click="remove">
            Borrar
          </button>
        </template>

        <button class="btn btn-xs btn-ghost border border-base-300 ml-auto" @click="exportCsv">
          Exportar CSV
        </button>
      </div>

      <div
        v-for="row in rows"
        :key="row.id"
        class="border rounded-lg bg-base-100"
        :class="row.status === 'new' ? 'border-primary/40' : 'border-base-300'"
      >
        <div class="flex items-start gap-3 p-3">
          <input
            type="checkbox"
            class="checkbox checkbox-sm mt-1"
            :checked="selected.has(row.id)"
            @change="toggle(row.id)"
          />

          <button type="button" class="flex-1 text-left min-w-0" @click="open(row)">
            <div class="flex items-center gap-2 flex-wrap">
              <span :class="row.status === 'new' ? 'font-semibold' : ''">
                {{ row.fromName || row.fromEmail || "Sin nombre" }}
              </span>
              <span v-if="row.status === 'new'" class="badge badge-primary badge-sm">Nuevo</span>
              <span v-if="row.status === 'spam'" class="badge badge-ghost badge-sm">Spam</span>
              <span v-if="row.notifyError" class="badge badge-error badge-sm" title="El aviso por correo falló">
                Aviso fallido
              </span>
              <span class="text-xs text-base-content/50 ml-auto">{{ formatDate(row.createdAt) }}</span>
            </div>
            <p class="text-sm text-base-content/60 truncate">{{ summary(row) }}</p>
          </button>
        </div>

        <div v-if="expanded === row.id" class="border-t border-base-300 p-4 flex flex-col gap-3 text-sm">
          <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            <template v-for="[key, value] in Object.entries(row.values ?? {})" :key="key">
              <dt class="font-medium text-base-content/60">{{ key }}</dt>
              <dd class="whitespace-pre-wrap break-words">{{ value }}</dd>
            </template>
          </dl>

          <div class="flex flex-wrap gap-3 text-xs text-base-content/50 pt-2 border-t border-base-200">
            <span v-if="row.formLabel">Formulario: {{ row.formLabel }}</span>
            <a v-if="pageOf(row)" :href="pageOf(row)!.path" target="_blank" class="link">
              {{ pageOf(row)!.title }}
            </a>
            <span v-if="row.notifiedAt">Avisado por correo</span>
          </div>

          <div v-if="row.notifyError" class="alert alert-error text-xs">
            <span><strong>El aviso por correo falló:</strong> {{ row.notifyError }}</span>
          </div>

          <details v-if="row.consentText" class="text-xs text-base-content/50">
            <summary class="cursor-pointer">Consentimiento aceptado</summary>
            <p class="mt-1">{{ row.consentText }}</p>
          </details>

          <div class="flex gap-2">
            <a
              v-if="row.fromEmail"
              :href="`mailto:${row.fromEmail}`"
              class="btn btn-sm btn-primary"
            >Responder</a>
            <button class="btn btn-sm btn-ghost border border-base-300" @click="expanded = null">Cerrar</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { actions } from "astro:actions";
import { notify } from "@/scripts/notify";

type Submission = {
  id: string;
  nodeId: string | null;
  formLabel: string | null;
  values: Record<string, string>;
  fromName: string | null;
  fromEmail: string | null;
  status: "new" | "read" | "spam";
  consentText: string | null;
  notifiedAt: string | null;
  notifyError: string | null;
  createdAt: string;
};

const props = defineProps<{
  submissions: string;
  pages: string;
  canDelete: boolean;
}>();

const rows = ref<Submission[]>(JSON.parse(props.submissions));
const pages = JSON.parse(props.pages) as Record<string, { title: string; path: string }>;

const selected = ref(new Set<string>());
const expanded = ref<string | null>(null);
const busy = ref(false);

const allSelected = computed(() => rows.value.length > 0 && selected.value.size === rows.value.length);

function toggle(id: string) {
  const next = new Set(selected.value);
  next.has(id) ? next.delete(id) : next.add(id);
  selected.value = next;
}

function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(rows.value.map((r) => r.id));
}

function pageOf(row: Submission) {
  return row.nodeId ? pages[row.nodeId] : undefined;
}

function summary(row: Submission) {
  const values = Object.values(row.values ?? {}).filter((v) => v && v !== "sí" && v !== "no");
  const longest = values.sort((a, b) => b.length - a.length)[0] ?? "";
  return longest.length > 140 ? `${longest.slice(0, 139)}…` : longest;
}

function formatDate(raw: string) {
  const date = new Date(raw);
  return date.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

/** Opening a message marks it read, which is what every inbox does and nobody remembers to. */
async function open(row: Submission) {
  expanded.value = expanded.value === row.id ? null : row.id;
  if (expanded.value === row.id && row.status === "new") {
    row.status = "read";
    await actions.forms.setStatus({ ids: [row.id], status: "read" });
  }
}

async function setStatus(status: "new" | "read" | "spam") {
  const ids = [...selected.value];
  busy.value = true;
  const { error } = await actions.forms.setStatus({ ids, status });
  busy.value = false;
  if (error) {
    notify.fromError(error, "No se han podido actualizar.");
    return;
  }
  for (const row of rows.value) if (selected.value.has(row.id)) row.status = status;
  selected.value = new Set();
  notify.success(`${ids.length} mensaje(s) actualizados.`);
}

async function remove() {
  const ids = [...selected.value];
  if (!confirm(`Borrar ${ids.length} mensaje(s)? No hay papelera: esto no se puede deshacer.`)) return;

  busy.value = true;
  const { error } = await actions.forms.remove({ ids });
  busy.value = false;
  if (error) {
    notify.fromError(error, "No se han podido borrar.");
    return;
  }
  rows.value = rows.value.filter((row) => !selected.value.has(row.id));
  selected.value = new Set();
  notify.success(`${ids.length} mensaje(s) borrados.`);
}

/**
 * Built in the browser from what is already on screen: a server route would need its own
 * permission check and would hand a URL around that leaks the leads if it is ever shared.
 */
function exportCsv() {
  const keys = [...new Set(rows.value.flatMap((row) => Object.keys(row.values ?? {})))];
  const header = ["fecha", "estado", "nombre", "email", ...keys];

  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [
    header.map(escape).join(","),
    ...rows.value.map((row) =>
      [
        new Date(row.createdAt).toISOString(),
        row.status,
        row.fromName ?? "",
        row.fromEmail ?? "",
        ...keys.map((key) => row.values?.[key] ?? ""),
      ]
        .map(escape)
        .join(",")
    ),
  ];

  // The BOM is what makes Excel open a UTF-8 CSV without mangling the accents.
  const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mensajes-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
</script>
