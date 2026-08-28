<template>
  <div class="flex flex-col gap-6">
    <!-- Estado -->
    <div class="panel">
      <div class="panel-body">
        <div class="flex flex-wrap items-center gap-3">
          <p class="admin-h2 flex-1">Estado</p>
          <span class="badge" :class="state.status === 'active' ? 'badge-success' : 'badge-warning'">
            {{ statusLabel(state.status) }}
          </span>
        </div>

        <p class="admin-hint">
          Sólo un inquilino activo sirve páginas. Mientras se monta o está suspendido, sus
          dominios responden 503 —no 404: el dominio es correcto y el sitio va a volver, y un
          404 le dice a Google que lo quite del índice.
        </p>

        <div class="flex flex-wrap items-end gap-2">
          <button
            v-for="option in STATUSES"
            :key="option"
            class="btn btn-sm"
            :class="option === state.status ? 'btn-primary' : 'btn-ghost border border-base-300'"
            :disabled="busy || option === state.status"
            @click="setStatus(option)"
          >{{ statusLabel(option) }}</button>

          <label v-if="state.status !== 'suspended'" class="field flex-1 min-w-56">
            <span class="field-label">Motivo, si lo suspendes</span>
            <input v-model="reason" type="text" class="input input-sm" placeholder="Impago de julio" />
            <span class="field-hint">Se guarda para ti. El visitante nunca lo ve.</span>
          </label>
        </div>

        <p v-if="state.suspendedReason" class="text-sm text-warning">
          Suspendido: {{ state.suspendedReason }}
        </p>
      </div>
    </div>

    <!-- Base de datos -->
    <div class="panel">
      <div class="panel-body">
        <p class="admin-h2">Base de datos</p>
        <template v-if="state.ownDatabase">
          <p class="admin-hint">Propia. Su contenido y sus sesiones están físicamente separados del resto.</p>
          <code class="text-xs text-base-content/50 break-all">{{ state.databaseUrl }}</code>
        </template>
        <template v-else>
          <p class="admin-hint">
            Comparte base con los demás, separado por <code>site_id</code>. Funciona, y hay un
            test que lo comprueba en cada ejecución — pero con base propia el aislamiento deja de
            depender de que ninguna consulta se olvide del filtro.
          </p>
          <div class="rounded-lg border border-base-300 bg-base-200 p-3">
            <p class="text-xs text-base-content/60 mb-1">Para darle la suya, desde una terminal:</p>
            <code class="text-xs">npm run provision -- new {{ state.slug }}</code>
          </div>
        </template>
      </div>
    </div>

    <!-- Dominios -->
    <div class="panel">
      <div class="panel-body">
        <p class="admin-h2">Dominios</p>
        <p class="admin-hint">
          El principal es el que usan los enlaces canónicos. Un cambio tarda hasta un minuto en
          verse en todas partes: la resolución se cachea por isolate y no hay forma de avisarles
          a todos.
        </p>

        <ul v-if="state.domains.length" class="data-list rounded-lg border border-base-300">
          <li
            v-for="domain in state.domains"
            :key="domain.host"
            class="flex flex-wrap items-center gap-3 px-3 py-2"
          >
            <code class="text-sm flex-1 min-w-0 truncate">{{ domain.host }}</code>
            <span v-if="domain.isPrimary" class="badge badge-primary badge-sm">principal</span>
            <button
              v-else
              class="btn btn-xs btn-ghost border border-base-300"
              :disabled="busy"
              @click="map(domain.host, true)"
            >Hacer principal</button>
            <button class="btn btn-xs btn-ghost text-error" :disabled="busy" @click="unmap(domain.host)">
              Quitar
            </button>
          </li>
        </ul>
        <p v-else class="text-sm text-base-content/50">
          Ninguno todavía: este inquilino no responde en ninguna parte.
        </p>

        <div class="flex flex-wrap items-end gap-2">
          <label class="field flex-1 min-w-56">
            <span class="field-label">Añadir dominio</span>
            <input
              v-model="newHost"
              type="text"
              class="input input-sm"
              placeholder="panaderia-sol.es"
              @keyup.enter="map(newHost, !state.domains.length)"
            />
          </label>
          <button
            class="btn btn-sm btn-primary"
            :disabled="!newHost.trim() || busy"
            @click="map(newHost, !state.domains.length)"
          >Añadir</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { actions } from "astro:actions";
import { notify } from "@/scripts/notify";

type Status = "provisioning" | "active" | "suspended";
type Tenant = {
  id: string;
  slug: string;
  name: string;
  status: Status;
  ownDatabase: boolean;
  databaseUrl: string | null;
  suspendedReason: string | null;
  domains: { host: string; isPrimary: boolean }[];
};

const props = defineProps<{ tenant: string }>();

const STATUSES: Status[] = ["provisioning", "active", "suspended"];
const state = reactive<Tenant>(JSON.parse(props.tenant));
const newHost = ref("");
const reason = ref("");
const busy = ref(false);

function statusLabel(status: Status): string {
  return { provisioning: "montándose", active: "activo", suspended: "suspendido" }[status];
}

async function setStatus(status: Status) {
  busy.value = true;
  const { error } = await actions.panel.setStatus({
    tenantId: state.id,
    status,
    ...(reason.value.trim() ? { reason: reason.value.trim() } : {}),
  });
  busy.value = false;
  if (error) return notify.fromError(error, "No se ha podido cambiar el estado.");

  state.status = status;
  state.suspendedReason = status === "suspended" ? reason.value.trim() || null : null;
  reason.value = "";
  notify.success(`Ahora está ${statusLabel(status)}.`);
}

async function map(host: string, primary: boolean) {
  const value = host.trim();
  if (!value) return;
  busy.value = true;
  const { data, error } = await actions.panel.mapDomain({ tenantId: state.id, host: value, primary });
  busy.value = false;
  if (error) return notify.fromError(error, "No se ha podido asignar.");

  if (primary) for (const domain of state.domains) domain.isPrimary = false;
  const existing = state.domains.find((d) => d.host === data!.host);
  if (existing) existing.isPrimary = primary;
  else state.domains.push({ host: data!.host, isPrimary: primary });
  state.domains.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  newHost.value = "";
  notify.success(`${data!.host} apunta aquí.`);
}

async function unmap(host: string) {
  busy.value = true;
  const { error } = await actions.panel.unmapDomain({ tenantId: state.id, host });
  busy.value = false;
  if (error) return notify.fromError(error, "No se ha podido quitar.");
  state.domains = state.domains.filter((d) => d.host !== host);
  notify.success(`${host} ya no apunta aquí.`);
}
</script>
