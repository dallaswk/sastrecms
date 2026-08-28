<template>
  <div class="flex flex-col gap-6">
    <!-- Crear -->
    <div v-if="canCreate" class="panel">
      <div class="panel-body">
        <p class="admin-h2">Nuevo inquilino</p>
        <p class="admin-hint">
          Crea el registro. Después hay que darle base de datos desde una terminal —el panel no
          puede: migrar lee la carpeta <code>drizzle/</code> del disco, que dentro del Worker no
          existe.
        </p>

        <!--
          Rejilla y no una fila flexible.
 
          Con `flex items-end`, un campo que lleva pista debajo y otro que no tienen alturas
          distintas, así que sus etiquetas y sus cajas quedaban a distinto nivel y el botón
          flotando entre medias. En rejilla, cada campo ocupa su celda y la pista crece hacia
          abajo sin mover a nadie.
        -->
        <div class="field-grid">
          <label class="field">
            <span class="field-label">Nombre</span>
            <input
              v-model="name"
              type="text"
              class="input"
              placeholder="Panadería Sol"
              @keyup.enter="create"
            />
            <span class="field-hint">Como se llama el cliente. Se puede cambiar después.</span>
          </label>
          <label class="field">
            <span class="field-label">Slug</span>
            <input v-model="slug" type="text" class="input" :placeholder="suggestedSlug || 'panaderia-sol'" />
            <span class="field-hint">Va en la URL del panel y en el nombre de su base.</span>
          </label>
        </div>

        <div class="flex items-center gap-3">
          <button class="btn btn-primary" :disabled="!name.trim() || busy" @click="create">
            {{ busy ? "Creando…" : "Crear inquilino" }}
          </button>
          <span v-if="name.trim()" class="text-xs text-base-content/50">
            Nacerá en «montándose»: no sirve nada hasta que tenga base y lo actives.
          </span>
        </div>
      </div>
    </div>

    <!-- Lista -->
    <div v-if="!rows.length" class="empty-state">
      <strong>No administras ningún inquilino todavía</strong>
      <p v-if="canCreate">Crea el primero ahí arriba.</p>
      <p v-else>Pide a un super admin que te dé acceso a alguno.</p>
    </div>

    <div v-else class="flex flex-col gap-3">
      <a
        v-for="tenant in rows"
        :key="tenant.id"
        :href="`/panel/${tenant.slug}`"
        class="panel hover:border-primary/40 transition-colors"
      >
        <div class="panel-body">
          <div class="flex flex-wrap items-start gap-3">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="admin-h2">{{ tenant.name }}</span>
              <code class="text-xs text-base-content/50">{{ tenant.slug }}</code>
            </div>
            <span class="badge badge-sm" :class="statusClass(tenant.status)">
              {{ statusLabel(tenant.status) }}
            </span>
            <span class="badge badge-ghost badge-sm">
              {{ tenant.ownDatabase ? "base propia" : "base compartida" }}
            </span>
          </div>

          <div v-if="tenant.domains.length" class="flex flex-wrap gap-2">
            <span
              v-for="domain in tenant.domains"
              :key="domain.host"
              class="text-xs px-2 py-0.5 rounded border"
              :class="domain.isPrimary
                ? 'border-primary/40 bg-primary/10 font-medium'
                : 'border-base-300 text-base-content/60'"
            >{{ domain.host }}</span>
          </div>
          <p v-else class="text-xs text-base-content/50">Sin dominios: todavía no responde en ninguna parte.</p>
        </div>
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { actions } from "astro:actions";
import { notify } from "@/scripts/notify";

type Tenant = {
  id: string;
  slug: string;
  name: string;
  status: "provisioning" | "active" | "suspended";
  ownDatabase: boolean;
  domains: { host: string; isPrimary: boolean }[];
};

const props = defineProps<{ tenants: string; canCreate: boolean }>();

const rows = ref<Tenant[]>(JSON.parse(props.tenants));
const name = ref("");
const slug = ref("");
const busy = ref(false);

/** Lo mismo que hace el servidor, para que el marcador de posición no mienta. */
const suggestedSlug = computed(() =>
  name.value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
);

function statusLabel(status: Tenant["status"]): string {
  return { provisioning: "montándose", active: "activo", suspended: "suspendido" }[status];
}

function statusClass(status: Tenant["status"]): string {
  // Sólo `active` sirve páginas, así que sólo `active` va en verde. Que «montándose» y
  // «suspendido» compartan color es correcto: los dos responden 503.
  return status === "active" ? "badge-success" : "badge-warning";
}

async function create() {
  busy.value = true;
  const { data, error } = await actions.panel.create({
    name: name.value.trim(),
    ...(slug.value.trim() ? { slug: slug.value.trim() } : {}),
  });
  busy.value = false;

  if (error) return notify.fromError(error, "No se ha podido crear.");
  notify.success(`«${name.value.trim()}» creado.`);
  window.location.href = `/panel/${data!.slug}`;
}
</script>
