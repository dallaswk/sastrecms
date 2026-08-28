<template>
  <div class="panel">
    <div class="panel-body">
      <div class="flex flex-wrap items-center gap-3">
        <p class="admin-h2 flex-1">Quién administra este sitio</p>
        <button
          v-if="loaded && !creating"
          class="btn btn-sm btn-primary"
          @click="creating = true"
        >Añadir cuenta</button>
      </div>

      <p class="admin-hint">
        Las cuentas viven en la base del cliente, no en la nuestra. Desde aquí se crean y se
        arreglan; el día a día lo lleva él desde su propio backoffice.
      </p>

      <!-- Alta -->
      <div v-if="creating" class="rounded-lg border border-base-300 bg-base-200/40 p-4 flex flex-col gap-4">
        <div class="field-grid">
          <label class="field">
            <span class="field-label">Correo</span>
            <input v-model="form.email" type="email" class="input input-sm" placeholder="maria@cliente.es" />
            <span class="field-hint">Con el que entrará a su backoffice.</span>
          </label>
          <label class="field">
            <span class="field-label">Nombre</span>
            <input v-model="form.name" type="text" class="input input-sm" placeholder="María" />
            <span class="field-hint">Opcional. Sin él se usa la parte del correo.</span>
          </label>
          <label class="field">
            <span class="field-label">Rol</span>
            <select v-model="form.role" class="select select-sm">
              <option value="admin">Administrador</option>
              <option value="editor">Editor</option>
              <option value="collaborator">Colaborador</option>
            </select>
            <span class="field-hint">El primero tiene que ser administrador.</span>
          </label>
          <label class="field">
            <span class="field-label">Contraseña</span>
            <input v-model="form.password" type="text" class="input input-sm" placeholder="se genera sola" />
            <span class="field-hint">En blanco, se genera una y se enseña aquí una sola vez.</span>
          </label>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button class="btn btn-sm btn-primary" :disabled="!form.email.trim() || busy" @click="create">
            {{ busy ? "Creando…" : "Crear cuenta" }}
          </button>
          <button class="btn btn-sm btn-ghost" :disabled="busy" @click="creating = false">Cancelar</button>
        </div>
      </div>

      <!--
        La contraseña recién generada.
 
        Fuera de la lista y con aviso de que no vuelve a salir: es lo único de esta página que
        no se puede recuperar recargando, y enterrarla entre las filas es cómo alguien cierra la
        pestaña y tiene que volver a restablecerla.
      -->
      <div v-if="secret" class="rounded-lg border border-warning/40 bg-warning/10 p-3 flex flex-col gap-1">
        <span class="text-sm font-medium">{{ secret.email }}</span>
        <code class="text-base font-mono select-all">{{ secret.password }}</code>
        <span class="text-xs text-base-content/60">
          No se vuelve a enseñar. Cópiala antes de cerrar, o tendrás que restablecerla.
        </span>
      </div>

      <!-- Lista -->
      <p v-if="!loaded" class="text-sm text-base-content/50">Cargando…</p>
      <p v-else-if="error" class="text-sm text-error whitespace-pre-wrap">{{ error }}</p>
      <p v-else-if="!people.length" class="text-sm text-base-content/50">
        Este sitio no tiene ninguna cuenta todavía: nadie puede entrar a administrarlo.
      </p>

      <ul v-else class="data-list rounded-lg border border-base-300">
        <li v-for="person in people" :key="person.id" class="flex flex-wrap items-center gap-3 px-3 py-2">
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="text-sm font-medium truncate">{{ person.name || person.email }}</span>
            <code class="text-xs text-base-content/50 truncate">{{ person.email }}</code>
          </div>

          <span v-if="person.disabled" class="badge badge-ghost badge-sm">desactivada</span>

          <select
            class="select select-xs w-36"
            :value="person.role ?? ''"
            :disabled="busy"
            @change="setRole(person, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">sin rol</option>
            <option value="admin">Administrador</option>
            <option value="editor">Editor</option>
            <option value="collaborator">Colaborador</option>
          </select>

          <button
            class="btn btn-xs btn-ghost border border-base-300"
            :disabled="busy"
            title="Genera una contraseña nueva y cierra sus sesiones"
            @click="reset(person)"
          >Restablecer</button>

          <button
            v-if="canEmail"
            class="btn btn-xs btn-ghost border border-base-300"
            :disabled="busy"
            @click="sendLink(person)"
          >Enviar acceso</button>

          <button
            class="btn btn-xs btn-ghost"
            :class="person.disabled ? 'text-success' : 'text-error'"
            :disabled="busy"
            @click="toggleActive(person)"
          >{{ person.disabled ? "Reactivar" : "Desactivar" }}</button>
        </li>
      </ul>

      <p v-if="loaded && !canEmail && people.length" class="text-xs text-base-content/50">
        No se puede enviar acceso por correo:
        {{ primaryHost ? "este inquilino no tiene clave de Resend en sus ajustes." : "todavía no tiene ningún dominio." }}
        Usa «Restablecer» y pásale la contraseña tú.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { actions } from "astro:actions";
import { notify } from "@/scripts/notify";

/**
 * La gente del inquilino, administrada desde el panel.
 *
 * Se carga en el cliente y no desde el servidor de la página a propósito: abrir la base de otro
 * inquilino es una conexión más, y una página de detalle que la abre siempre la paga aunque
 * quien entra sólo venga a mapear un dominio.
 */

type Person = {
  id: string;
  email: string;
  name: string;
  disabled: boolean;
  role: "admin" | "editor" | "collaborator" | null;
};

const props = defineProps<{ tenantId: string }>();

const people = ref<Person[]>([]);
const loaded = ref(false);
const error = ref("");
const busy = ref(false);
const creating = ref(false);
const canEmail = ref(false);
const primaryHost = ref<string | null>(null);
const secret = ref<{ email: string; password: string } | null>(null);

const form = ref({ email: "", name: "", role: "admin" as Person["role"], password: "" });

async function load() {
  const { data, error: failed } = await actions.panel.listUsers({ tenantId: props.tenantId });
  loaded.value = true;
  if (failed) {
    // En el bloque y no como toast: es el estado de esta tarjeta, y un aviso que se desvanece
    // deja la lista vacía sin decir por qué.
    error.value = failed.message;
    return;
  }
  error.value = "";
  people.value = data!.users as Person[];
  canEmail.value = data!.canEmail;
  primaryHost.value = data!.primaryHost;
}

onMounted(load);

async function create() {
  busy.value = true;
  const { data, error: failed } = await actions.panel.createUser({
    tenantId: props.tenantId,
    email: form.value.email.trim(),
    ...(form.value.name.trim() ? { name: form.value.name.trim() } : {}),
    role: form.value.role ?? "admin",
    ...(form.value.password.trim() ? { password: form.value.password.trim() } : {}),
  });
  busy.value = false;
  if (failed) return notify.fromError(failed, "No se ha podido crear.");

  if (data!.password) secret.value = { email: data!.email, password: data!.password };
  notify.success(
    data!.granted
      ? `${data!.email} ya tenía cuenta en esta base; se le ha dado acceso a este sitio.`
      : `${data!.email} creada.`
  );
  creating.value = false;
  form.value = { email: "", name: "", role: "admin", password: "" };
  await load();
}

async function setRole(person: Person, value: string) {
  busy.value = true;
  const { error: failed } = await actions.panel.setUserRole({
    tenantId: props.tenantId,
    userId: person.id,
    role: (value || null) as Person["role"],
  });
  busy.value = false;
  if (failed) {
    notify.fromError(failed, "No se ha podido cambiar el rol.");
    // Recargar y no dejar el select donde lo puso el clic: si el servidor se negó, la interfaz
    // no puede quedarse enseñando el estado que no llegó a guardarse.
    return load();
  }
  notify.success("Rol cambiado.");
  await load();
}

async function toggleActive(person: Person) {
  busy.value = true;
  const { error: failed } = await actions.panel.setUserActive({
    tenantId: props.tenantId,
    userId: person.id,
    disabled: !person.disabled,
  });
  busy.value = false;
  if (failed) return notify.fromError(failed, "No se ha podido cambiar.");
  await load();
}

async function reset(person: Person) {
  busy.value = true;
  const { data, error: failed } = await actions.panel.resetPassword({
    tenantId: props.tenantId,
    userId: person.id,
  });
  busy.value = false;
  if (failed) return notify.fromError(failed, "No se ha podido restablecer.");
  secret.value = { email: data!.email, password: data!.password };
  notify.success("Contraseña nueva. Sus sesiones se han cerrado.");
}

async function sendLink(person: Person) {
  busy.value = true;
  const { data, error: failed } = await actions.panel.sendAccessLink({
    tenantId: props.tenantId,
    userId: person.id,
  });
  busy.value = false;
  if (failed) return notify.fromError(failed, "No se ha podido enviar.");
  notify.success(`Enlace enviado a ${data!.email}.`);
}
</script>
