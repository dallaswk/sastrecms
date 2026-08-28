import { sql, relations } from "drizzle-orm";
import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

/**
 * El plano de control: qué inquilinos existen, en qué dominios y quién los administra.
 *
 * Vive en **otra base de datos**, y por eso este fichero no importa nada de `schema.ts`. La
 * separación no es estética: en cuanto cada inquilino tenga la suya (paso 5), el plano de
 * control es lo único que sabe dónde está cada una, así que no puede vivir dentro de ninguna.
 * Una clave foránea de aquí a `sites` sería precisamente la que impide separarlas.
 *
 * También es la razón de que esto no sea una tabla más en la base de la aplicación: quien
 * resuelve un dominio lo hace antes de saber a qué base conectarse.
 */

export const TENANT_STATUS = ["provisioning", "active", "suspended"] as const;
export type TenantStatus = (typeof TENANT_STATUS)[number];

export const tenants = sqliteTable(
  "tenants",
  {
    id: text("id").primaryKey(),
    /** Nombre para las personas: «Reformas Ruiz». */
    name: text("name").notNull(),
    /** Identificador corto y estable, para URLs del panel y nombres de base de datos. */
    slug: text("slug").notNull().unique(),

    /**
     * En qué estado está.
     *
     * `provisioning` mientras se crea su base y se migra: hasta que termine no debe servir, o
     * un visitante vería un sitio a medio construir. `suspended` la corta sin borrar nada.
     * Quién mueve este campo —impago, decisión manual— es cosa de la facturación; lo que hace
     * cuando se mueve está en `resolveTenant`, para que el campo nunca sea decorativo.
     */
    status: text("status", { enum: TENANT_STATUS }).notNull().default("provisioning"),

    /**
     * El id del sitio *dentro de* su base de datos.
     *
     * Con base compartida distingue un inquilino de otro. Con base propia (paso 5) casi
     * siempre será `site_default`, porque ahí ya no hay nada de quien distinguirlo — pero
     * sigue haciendo falta: quien lee el contenido necesita el id, y adivinarlo sería empezar
     * a suponer cosas sobre bases que este código no controla.
     */
    siteId: text("site_id").notNull(),

    /**
     * Dónde está su base, cuando no es la compartida.
     *
     * Nulo significa «la de siempre, distinguido por `siteId`», que es el modelo de hoy. Así
     * el paso 5 es rellenar estas dos columnas inquilino a inquilino, no una migración de
     * esquema con todo el mundo dentro.
     *
     * El token está aquí en claro, y hay que decirlo en voz alta: quien lea esta base lee
     * todas las demás. Es la contrapartida de tener un plano de control, y lo que la hace
     * aceptable es tratar esta base como un secreto, no como datos. Cifrarlo con una clave
     * que vive en el mismo Worker no añadiría nada: quien puede leer la fila puede leer la
     * clave.
     */
    databaseUrl: text("database_url"),
    databaseAuthToken: text("database_auth_token"),

    /** Etiqueta del plan contratado. La facturación en sí es de otro paso. */
    plan: text("plan"),
    notes: text("notes"),

    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    suspendedAt: integer("suspended_at", { mode: "timestamp" }),
    /** Por qué se suspendió. Se le enseña a quien administra, nunca al visitante. */
    suspendedReason: text("suspended_reason"),
  },
  (t) => [index("tenants_status_idx").on(t.status)]
);

/**
 * Los dominios de cada inquilino.
 *
 * Tabla aparte y no una columna en `tenants` porque un sitio real tiene más de uno desde el
 * primer día: el dominio bueno, el `www`, y el subdominio de pruebas mientras se monta. Con una
 * columna, cada uno de ésos sería un inquilino distinto.
 */
export const domains = sqliteTable(
  "domains",
  {
    /** El host, en minúsculas y sin puerto. Lo normaliza `normaliseHost` antes de escribir. */
    host: text("host").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** El canónico, al que apuntan los enlaces y el `canonical`. Sólo uno por inquilino. */
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    /**
     * Cuándo se comprobó que el DNS apunta aquí.
     *
     * Nulo no impide servir: si la petición ha llegado con este host, el DNS ya apunta. Sirve
     * para que el panel sepa distinguir «configurado» de «escrito a mano y todavía sin efecto».
     */
    verifiedAt: integer("verified_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("domains_tenant_idx").on(t.tenantId)]
);

/**
 * Quién puede usar el panel de inquilinos.
 *
 * Gente distinta de la que edita contenido: aquí están quienes montan y administran sitios,
 * no quienes escriben en ellos. Mezclarlos daría a cualquier editor de cualquier cliente una
 * fila en la tabla que decide quién puede crear y borrar inquilinos.
 */
export const operators = sqliteTable("operators", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  /** Ve y administra todos los inquilinos, sin necesitar una fila en `operatorTenants`. */
  isSuperAdmin: integer("is_super_admin", { mode: "boolean" }).notNull().default(false),
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const OPERATOR_ROLES = ["owner", "manager"] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

/** Qué inquilinos administra cada operador. El `user_roles` del plano de control. */
export const operatorTenants = sqliteTable(
  "operator_tenants",
  {
    operatorId: text("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: text("role", { enum: OPERATOR_ROLES }).notNull().default("manager"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    primaryKey({ columns: [t.operatorId, t.tenantId] }),
    index("operator_tenants_tenant_idx").on(t.tenantId),
  ]
);

export const tenantsRelations = relations(tenants, ({ many }) => ({
  domains: many(domains),
  operators: many(operatorTenants),
}));

export const domainsRelations = relations(domains, ({ one }) => ({
  tenant: one(tenants, { fields: [domains.tenantId], references: [tenants.id] }),
}));

export const operatorTenantsRelations = relations(operatorTenants, ({ one }) => ({
  operator: one(operators, { fields: [operatorTenants.operatorId], references: [operators.id] }),
  tenant: one(tenants, { fields: [operatorTenants.tenantId], references: [tenants.id] }),
}));
