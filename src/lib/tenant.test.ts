import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  resolveTenant,
  forgetTenant,
  forgetAllTenants,
  isServable,
  STANDALONE,
} from "./tenant";
import type { ControlDatabase } from "@db/control-client";

/**
 * La resolución de dominio corre antes que nada en cada petición pública, así que sus fallos no
 * son fallos de una página: son del sitio entero, y de todos a la vez.
 */

type Row = {
  id: string;
  siteId: string;
  status: "provisioning" | "active" | "suspended";
  databaseUrl: string | null;
  databaseAuthToken: string | null;
};

/**
 * Un plano de control de mentira.
 *
 * Devuelve lo que se le diga y cuenta las veces que se le ha pedido conexión, que es la mitad
 * de lo que hay que comprobar aquí: acertar en caché y aun así abrir un cliente libSQL sería
 * un fallo invisible en los datos y carísimo en producción.
 */
function fakeControl(rowsByHost: Record<string, Row>) {
  const calls = { connect: 0, query: 0 };

  const connect = () => {
    calls.connect += 1;
    return {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: (condition: unknown) => ({
              limit: async () => {
                calls.query += 1;
                // La condición real es un objeto de drizzle; para el doble basta con leer el
                // host del último `resolveTenant`, que el test fija antes de llamar.
                const host = (condition as { __host?: string }).__host ?? lastHost;
                const row = rowsByHost[host];
                return row ? [row] : [];
              },
            }),
          }),
        }),
      }),
    } as unknown as ControlDatabase;
  };

  return { connect, calls };
}

let lastHost = "";

/** Envuelve `resolveTenant` recordando el host, que es lo que el doble no puede leer del where. */
async function resolve(control: ReturnType<typeof fakeControl>, host: string) {
  lastHost = host.trim().toLowerCase().replace(/:\d+$/, "");
  return resolveTenant(control.connect, host);
}

beforeEach(() => {
  forgetAllTenants();
  vi.useRealTimers();
});
afterEach(() => vi.useRealTimers());

const ACTIVE: Row = {
  id: "t_ruiz",
  siteId: "site_default",
  status: "active",
  databaseUrl: null,
  databaseAuthToken: null,
};

describe("sin plano de control", () => {
  it("devuelve el sitio por defecto sin abrir ninguna conexión", async () => {
    // La condición para que esto se pueda añadir a una instalación que ya está sirviendo.
    expect(await resolveTenant(null, "cliente.com")).toEqual(STANDALONE);
  });
});

describe("resolución", () => {
  it("encuentra el inquilino de un dominio", async () => {
    const control = fakeControl({ "reformasruiz.es": ACTIVE });
    const tenant = await resolve(control, "reformasruiz.es");
    expect(tenant.tenantId).toBe("t_ruiz");
    expect(tenant.siteId).toBe("site_default");
    expect(tenant.database).toBeNull();
  });

  it("ignora el puerto y las mayúsculas", async () => {
    const control = fakeControl({ "reformasruiz.es": ACTIVE });
    const tenant = await resolve(control, "ReformasRuiz.ES:443");
    expect(tenant.tenantId).toBe("t_ruiz");
  });

  it("un dominio que nadie reclama se sirve como mono-inquilino", async () => {
    // No es un 404: una instalación que acaba de estrenar plano de control tiene todos sus
    // dominios sin dar de alta, y devolver nada la apagaría.
    const control = fakeControl({});
    expect(await resolve(control, "todavia-no.com")).toEqual(STANDALONE);
  });

  it("devuelve la base propia del inquilino cuando la tiene", async () => {
    const control = fakeControl({
      "otro.com": { ...ACTIVE, databaseUrl: "libsql://otro", databaseAuthToken: "tok" },
    });
    const tenant = await resolve(control, "otro.com");
    expect(tenant.database).toEqual({ url: "libsql://otro", authToken: "tok" });
  });

  it("omite el token cuando no lo hay, en vez de mandar undefined", async () => {
    const control = fakeControl({
      "otro.com": { ...ACTIVE, databaseUrl: "file:local.db", databaseAuthToken: null },
    });
    const tenant = await resolve(control, "otro.com");
    expect(tenant.database).toEqual({ url: "file:local.db" });
    expect("authToken" in tenant.database!).toBe(false);
  });
});

describe("caché", () => {
  it("no abre conexión cuando acierta", async () => {
    const control = fakeControl({ "reformasruiz.es": ACTIVE });
    await resolve(control, "reformasruiz.es");
    await resolve(control, "reformasruiz.es");
    await resolve(control, "reformasruiz.es");
    expect(control.calls.connect).toBe(1);
  });

  it("también recuerda los fallos", async () => {
    // Si no, cada petición a un dominio no dado de alta es un viaje al plano de control, y
    // provocarlas es tan fácil como mandar cabeceras Host inventadas.
    const control = fakeControl({});
    await resolve(control, "nadie.com");
    await resolve(control, "nadie.com");
    expect(control.calls.query).toBe(1);
  });

  it("caduca, para que mapear un dominio se vea sin esperar a que recicle el isolate", async () => {
    vi.useFakeTimers();
    const control = fakeControl({});
    await resolve(control, "recien.com");

    vi.advanceTimersByTime(61_000);
    const control2 = fakeControl({ "recien.com": ACTIVE });
    // Mismo host, otra respuesta: el TTL es lo que permite que cambie sin desplegar.
    expect((await resolve(control2, "recien.com")).tenantId).toBe("t_ruiz");
  });

  it("se vacía antes de que la llene quien quiera", async () => {
    const control = fakeControl({});
    for (let i = 0; i < 600; i++) await resolve(control, `basura-${i}.com`);
    // Sin tope, un isolate caliente guarda una entrada por cada Host inventado que le manden.
    const before = control.calls.query;
    await resolve(control, "basura-599.com");
    expect(control.calls.query).toBe(before);

    // Y una de las primeras ya no está: se vació por el camino.
    await resolve(control, "basura-0.com");
    expect(control.calls.query).toBeGreaterThan(before);
  });

  it("forgetTenant olvida sólo ese host", async () => {
    const control = fakeControl({ "a.com": ACTIVE, "b.com": ACTIVE });
    await resolve(control, "a.com");
    await resolve(control, "b.com");
    const before = control.calls.query;

    forgetTenant("A.com:443");
    await resolve(control, "b.com");
    expect(control.calls.query).toBe(before);
    await resolve(control, "a.com");
    expect(control.calls.query).toBe(before + 1);
  });
});

describe("estado del inquilino", () => {
  it("sólo sirve el que está activo", () => {
    expect(isServable({ ...STANDALONE, status: "active" })).toBe(true);
    expect(isServable({ ...STANDALONE, status: "suspended" })).toBe(false);
    // La ventana entre crear el inquilino y terminar de migrar su base: durante ella el
    // dominio ya resuelve, y servir sería enseñar una base a medio construir.
    expect(isServable({ ...STANDALONE, status: "provisioning" })).toBe(false);
  });

  it("el estado llega hasta quien decide", async () => {
    const control = fakeControl({ "moroso.com": { ...ACTIVE, status: "suspended" } });
    const tenant = await resolve(control, "moroso.com");
    expect(tenant.status).toBe("suspended");
    expect(isServable(tenant)).toBe(false);
  });
});
