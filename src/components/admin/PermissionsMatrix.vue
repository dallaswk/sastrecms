<template>
  <div class="flex flex-col gap-8">
    <div v-for="role in roles" :key="role.id" class="card bg-base-100 border border-base-300">
      <div class="card-body gap-4">
        <div class="flex items-center gap-2">
          <h2 class="card-title text-base capitalize">{{ role.label }}</h2>
          <span class="badge badge-outline badge-sm">{{ role.key }}</span>
          <span v-if="role.key === 'admin'" class="badge badge-success badge-sm">Acceso total siempre</span>
        </div>

        <div v-if="role.key === 'admin'" class="text-sm text-base-content/50">
          Los administradores tienen acceso completo a todos los tipos de contenido. No es necesario configurar permisos.
        </div>

        <template v-else>
          <div class="overflow-x-auto">
            <table class="table table-sm w-full">
              <thead>
                <tr>
                  <th class="w-48">Tipo de contenido</th>
                  <th class="text-center">Ver</th>
                  <th class="text-center">Crear</th>
                  <th class="text-center">Editar</th>
                  <th class="text-center">Borrar</th>
                  <th class="text-center">Publicar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ct in contentTypes" :key="ct.id">
                  <td class="font-medium">{{ ct.label }}</td>
                  <template v-for="perm in [getOrCreate(role.id, ct.id)]" :key="ct.id + '-perm'">
                    <td class="text-center">
                      <input type="checkbox" class="checkbox checkbox-sm" v-model="perm.canView" @change="save(role.id, ct.id, perm)" />
                    </td>
                    <td class="text-center">
                      <input type="checkbox" class="checkbox checkbox-sm" v-model="perm.canCreate" @change="save(role.id, ct.id, perm)" />
                    </td>
                    <td class="text-center">
                      <input type="checkbox" class="checkbox checkbox-sm" v-model="perm.canEdit" @change="save(role.id, ct.id, perm)" />
                    </td>
                    <td class="text-center">
                      <input type="checkbox" class="checkbox checkbox-sm" v-model="perm.canDelete" @change="save(role.id, ct.id, perm)" />
                    </td>
                    <td class="text-center">
                      <input type="checkbox" class="checkbox checkbox-sm" v-model="perm.canPublish" @change="save(role.id, ct.id, perm)" />
                    </td>
                    <td class="text-center">
                      <span v-if="saving === role.id + ct.id" class="loading loading-spinner loading-xs"></span>
                      <span v-else-if="saved === role.id + ct.id" class="text-success text-xs">✓</span>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-if="errors[role.id]" class="text-error text-sm">{{ errors[role.id] }}</p>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { actions } from "astro:actions";

interface PermRow {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPublish: boolean;
}

interface ContentTypeInfo {
  id: string;
  key: string;
  label: string;
}

interface RoleInfo {
  id: string;
  key: string;
  label: string;
  permissions: Array<{
    id: string;
    roleId: string;
    contentTypeId: string | null;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canPublish: boolean;
  }>;
}

const props = defineProps<{
  roles: RoleInfo[];
  contentTypes: ContentTypeInfo[];
}>();

const saving = ref("");
const saved = ref("");
const errors = reactive<Record<string, string>>({});

const matrix = reactive<Record<string, PermRow>>({});

function permKey(roleId: string, ctId: string) {
  return `${roleId}::${ctId}`;
}

function getOrCreate(roleId: string, ctId: string): PermRow {
  const key = permKey(roleId, ctId);
  if (!matrix[key]) {
    const role = props.roles.find((r) => r.id === roleId);
    const existing = role?.permissions.find((p) => p.contentTypeId === ctId);
    matrix[key] = reactive({
      canView: existing?.canView ?? false,
      canCreate: existing?.canCreate ?? false,
      canEdit: existing?.canEdit ?? false,
      canDelete: existing?.canDelete ?? false,
      canPublish: existing?.canPublish ?? false,
    });
  }
  return matrix[key];
}

async function save(roleId: string, ctId: string, perm: PermRow) {
  const key = roleId + ctId;
  saving.value = key;
  errors[roleId] = "";

  const { error } = await actions.permissions.setPermission({
    roleId,
    contentTypeId: ctId,
    canView: perm.canView,
    canCreate: perm.canCreate,
    canEdit: perm.canEdit,
    canDelete: perm.canDelete,
    canPublish: perm.canPublish,
  });

  saving.value = "";
  if (error) {
    errors[roleId] = error.message;
  } else {
    saved.value = key;
    setTimeout(() => { if (saved.value === key) saved.value = ""; }, 1500);
  }
}
</script>
