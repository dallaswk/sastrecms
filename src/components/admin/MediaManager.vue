<template>
  <div class="flex flex-col gap-4">
    <!-- Toolbar -->
    <div class="flex flex-wrap gap-3 items-center justify-between">
      <div class="flex gap-2 items-center">
        <button class="btn btn-ghost btn-sm" :disabled="!currentFolderId" @click="navigateUp">
          ← Atrás
        </button>
        <span class="text-sm text-base-content/50">
          {{ currentFolderId ? "Carpeta actual" : "Raíz" }}
        </span>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm" @click="showNewFolder = !showNewFolder">
          + Carpeta
        </button>
        <label class="btn btn-primary btn-sm cursor-pointer">
          <input type="file" class="hidden" multiple accept="image/*,video/*,.pdf,.doc,.docx" @change="handleFileSelect" />
          Subir archivos
        </label>
      </div>
    </div>

    <!-- New folder input -->
    <div v-if="showNewFolder" class="flex gap-2">
      <input
        v-model="newFolderName"
        type="text"
        class="input input-bordered input-sm flex-1"
        placeholder="Nombre de la carpeta"
        @keyup.enter="createFolder"
      />
      <button class="btn btn-sm btn-primary" @click="createFolder">Crear</button>
      <button class="btn btn-sm btn-ghost" @click="showNewFolder = false; newFolderName = ''">Cancelar</button>
    </div>

    <!-- Upload guidelines -->
    <div v-if="!pickerMode" class="alert alert-info py-2 text-xs flex-col items-start gap-0.5">
      <p class="font-medium">Guía de subida</p>
      <p>Imágenes: JPG, PNG, WebP, SVG · Máx. <strong>5 MB</strong> · Recomendado ≤ 2500 px en el lado mayor</p>
      <p>Vídeo: MP4, WebM · Máx. <strong>100 MB</strong> · PDF/DOC: cualquier tamaño razonable</p>
      <p class="text-warning">⚠ No se aplica optimización automática. Sube imágenes ya comprimidas para no afectar Core Web Vitals.</p>
    </div>

    <!-- Upload progress -->
    <div v-if="uploading" class="flex items-center gap-2 text-sm">
      <span class="loading loading-spinner loading-sm"></span>
      Subiendo {{ uploadQueue.length }} archivo(s)...
    </div>

    <!-- Error -->
    <div v-if="errorMsg" class="alert alert-error text-sm py-2">{{ errorMsg }}</div>

    <!-- Grid -->
    <div v-if="loading" class="flex justify-center py-12">
      <span class="loading loading-spinner loading-lg"></span>
    </div>

    <div v-else-if="folders.length === 0 && files.length === 0" class="text-center py-16 text-base-content/40">
      <p>Esta carpeta está vacía.</p>
    </div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      <!-- Folders -->
      <div
        v-for="folder in folders"
        :key="folder.id"
        class="card bg-base-200 border border-base-300 cursor-pointer hover:border-primary transition-colors"
        @click="navigateInto(folder.id)"
      >
        <div class="card-body p-3 items-center text-center">
          <div class="text-4xl">📁</div>
          <p class="text-xs font-medium truncate w-full">{{ folder.name }}</p>
          <button
            class="btn btn-xs btn-ghost text-error mt-1"
            @click.stop="deleteFolder(folder.id)"
          >Borrar</button>
        </div>
      </div>

      <!-- Files -->
      <div
        v-for="file in files"
        :key="file.id"
        class="card bg-base-100 border border-base-300 hover:border-primary transition-colors"
        :class="{ 'ring-2 ring-primary': selectedIds.includes(file.id) }"
        @click="toggleSelect(file.id)"
      >
        <div class="card-body p-3 gap-1">
          <div class="aspect-square bg-base-200 rounded overflow-hidden flex items-center justify-center">
            <img
              v-if="file.type === 'image'"
              :src="file.url"
              :alt="file.altText ?? file.url"
              class="w-full h-full object-cover"
            />
            <span v-else class="text-3xl">
              {{ file.type === 'video' ? '🎬' : file.type === 'pdf' ? '📄' : '📃' }}
            </span>
          </div>
          <p class="text-xs truncate text-base-content/70">{{ fileName(file.url) }}</p>
          <div class="flex gap-1 mt-1">
            <button
              class="btn btn-xs btn-ghost flex-1"
              @click.stop="copyUrl(file.url)"
            >Copiar URL</button>
            <button
              class="btn btn-xs btn-ghost text-error"
              @click.stop="deleteFile(file.id)"
            >✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Selection bar (for picker mode) -->
    <div v-if="pickerMode && selectedIds.length > 0" class="sticky bottom-0 bg-base-100 border-t border-base-300 p-3 flex justify-end gap-2">
      <button class="btn btn-ghost btn-sm" @click="selectedIds = []">Limpiar selección</button>
      <button class="btn btn-primary btn-sm" @click="confirmSelection">
        Seleccionar {{ selectedIds.length }} archivo(s)
      </button>
    </div>
  </div>

    <!-- Antes de borrar: dónde está enlazado el archivo -->
    <dialog class="modal" :class="{ 'modal-open': usageDialog !== null }">
      <div class="modal-box max-w-2xl">
        <h3 class="font-semibold text-lg">Este archivo está en uso</h3>
        <p class="text-sm text-base-content/70 mt-1">{{ usageDialog?.summary }}</p>
        <p class="text-sm text-base-content/70">
          Borrarlo no da error en las páginas: seguirán respondiendo, pero con la imagen
          rota. Comprueba estos contenidos antes de continuar.
        </p>

        <ul class="menu bg-base-200 rounded-box mt-4 max-h-72 overflow-y-auto w-full">
          <li v-for="n in usageDialog?.nodes ?? []" :key="n.nodeId">
            <a :href="`/admin/content/${n.nodeId}`" target="_blank" class="flex-col items-start gap-1">
              <span class="flex items-center gap-2 flex-wrap">
                <span class="font-medium">{{ n.title }}</span>
                <span
                  class="badge badge-sm"
                  :class="n.status === 'published' ? 'badge-success' : 'badge-ghost'"
                >{{ n.status }}</span>
                <span class="font-mono text-xs text-base-content/50">{{ n.path }}</span>
              </span>
              <span class="text-xs text-base-content/60">
                {{ n.locations.map((l) => l.kind === 'embedded' ? `${l.field} (dentro del texto)` : l.field).join(" · ") }}
              </span>
            </a>
          </li>
          <li v-for="label in usageDialog?.settings ?? []" :key="label">
            <a href="/admin/settings" target="_blank">
              <span class="font-medium">{{ label }}</span>
              <span class="badge badge-sm badge-warning">ajustes</span>
            </a>
          </li>
        </ul>

        <div class="modal-action">
          <button class="btn btn-ghost btn-sm" @click="usageDialog = null">Cancelar</button>
          <button class="btn btn-error btn-sm" :disabled="deleting" @click="confirmDelete">
            Borrar de todos modos
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop" @click="usageDialog = null"><button>cerrar</button></form>
    </dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { actions } from "astro:actions";

interface MediaFile {
  id: string;
  url: string;
  type: string;
  altText?: string | null;
  sizeBytes?: number | null;
}

interface MediaFolder {
  id: string;
  name: string;
}

const props = defineProps<{
  pickerMode?: boolean;
  multiple?: boolean;
}>();

const emit = defineEmits<{
  selected: [urls: string[]];
}>();

const loading = ref(true);
const uploading = ref(false);
const errorMsg = ref("");
const showNewFolder = ref(false);
const newFolderName = ref("");
const currentFolderId = ref<string | null>(null);
const folderHistory = ref<string[]>([]);
const files = ref<MediaFile[]>([]);
const folders = ref<MediaFolder[]>([]);
const selectedIds = ref<string[]>([]);
const uploadQueue = ref<File[]>([]);

async function loadContents() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const { data, error } = await actions.media.list({ folderId: currentFolderId.value });
    if (error) throw new Error(error.message);
    files.value = data!.files as MediaFile[];
    folders.value = data!.folders as MediaFolder[];
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : "Error al cargar";
  } finally {
    loading.value = false;
  }
}

function navigateInto(folderId: string) {
  folderHistory.value.push(currentFolderId.value ?? "");
  currentFolderId.value = folderId;
  loadContents();
}

function navigateUp() {
  currentFolderId.value = folderHistory.value.pop() || null;
  loadContents();
}

async function createFolder() {
  if (!newFolderName.value.trim()) return;
  try {
    const { error } = await actions.media.createFolder({
      name: newFolderName.value.trim(),
      parentId: currentFolderId.value,
    });
    if (error) throw new Error(error.message);
    newFolderName.value = "";
    showNewFolder.value = false;
    loadContents();
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : "Error al crear carpeta";
  }
}

async function deleteFolder(id: string) {
  if (!confirm("¿Borrar esta carpeta?")) return;
  try {
    const { error } = await actions.media.deleteFolder({ id });
    if (error) throw new Error(error.message);
    loadContents();
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : "Error al borrar";
  }
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;

  uploading.value = true;
  uploadQueue.value = Array.from(input.files);
  errorMsg.value = "";

  for (const file of uploadQueue.value) {
    const formData = new FormData();
    formData.append("file", file);
    if (currentFolderId.value) formData.append("folderId", currentFolderId.value);

    try {
      const { error } = await actions.media.upload(formData as never);
      if (error) throw new Error(error.message);
    } catch (err: unknown) {
      errorMsg.value = `Error subiendo "${file.name}": ${err instanceof Error ? err.message : "Error"}`;
    }
  }

  uploading.value = false;
  uploadQueue.value = [];
  input.value = "";
  loadContents();
}

type UsageDialog = {
  id: string;
  summary: string;
  nodes: { nodeId: string; title: string; path: string; status: string; locations: { field: string; kind: string }[] }[];
  settings: string[];
};
const usageDialog = ref<UsageDialog | null>(null);
const deleting = ref(false);

/**
 * Ask what references the file before offering to delete it. A media URL lives inside
 * the nodes' JSON, so removing the file leaves those pages serving a 200 with a broken
 * image — nothing fails loudly, which is exactly why the warning has to be here.
 */
async function deleteFile(id: string) {
  errorMsg.value = "";
  const { data, error } = await actions.media.usage({ id });
  if (error) {
    errorMsg.value = error.message;
    return;
  }

  if (data.nodes.length === 0 && data.settings.length === 0) {
    if (!confirm("¿Borrar este archivo? No está enlazado en ningún contenido.")) return;
    await runDelete(id, false);
    return;
  }

  usageDialog.value = { id, summary: data.summary, nodes: data.nodes, settings: data.settings };
}

function confirmDelete() {
  const dialog = usageDialog.value;
  if (dialog) void runDelete(dialog.id, true);
}

async function runDelete(id: string, force: boolean) {
  deleting.value = true;
  try {
    const { error } = await actions.media.delete({ id, force });
    if (error) throw new Error(error.message);
    usageDialog.value = null;
    loadContents();
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : "Error al borrar";
    usageDialog.value = null;
  } finally {
    deleting.value = false;
  }
}

function toggleSelect(id: string) {
  if (!props.pickerMode) return;
  if (props.multiple) {
    const idx = selectedIds.value.indexOf(id);
    if (idx >= 0) selectedIds.value.splice(idx, 1);
    else selectedIds.value.push(id);
  } else {
    selectedIds.value = [id];
  }
}

function confirmSelection() {
  const urls = files.value
    .filter((f) => selectedIds.value.includes(f.id))
    .map((f) => f.url);
  emit("selected", urls);
}

function copyUrl(url: string) {
  navigator.clipboard.writeText(url).then(() => {
    alert("URL copiada al portapapeles");
  });
}

function fileName(url: string): string {
  return url.split("/").pop() ?? url;
}

onMounted(loadContents);
</script>
