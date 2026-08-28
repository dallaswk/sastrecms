import { describe, it, expect } from "vitest";
import { authBaseUrl, normaliseHost, DEFAULT_SITE_ID } from "./site";

describe("normaliseHost", () => {
  it("quita el puerto y baja a minúsculas", () => {
    // `cliente.com:443` y `cliente.com` son el mismo sitio, y en desarrollo todo lleva puerto.
    expect(normaliseHost("Cliente.COM:443")).toBe("cliente.com");
    expect(normaliseHost("  segundo.localhost:4321 ")).toBe("segundo.localhost");
  });

  it("deja en paz lo que ya está normalizado", () => {
    expect(normaliseHost("cliente.com")).toBe("cliente.com");
    expect(normaliseHost("")).toBe("");
  });
});

describe("el sitio por defecto", () => {
  it("tiene un id estable, porque está escrito en datos ya guardados", () => {
    expect(DEFAULT_SITE_ID).toBe("site_default");
  });
});

describe("el baseURL de Better Auth", () => {
  const BASE = {
    requestOrigin: "http://segundo.localhost:4321",
    requestHost: "segundo.localhost:4321",
    claimedByTenant: false,
    siteHost: null,
    configured: "http://localhost:4321",
  };

  it("un dominio reclamado por el plano de control se cree", () => {
    /*
     * El fallo que trajo esto: `BETTER_AUTH_URL` es un valor fijo, así que en cuanto la
     * aplicación responde en más de un dominio, todos menos ése contestan «Invalid origin» y
     * nadie puede entrar. No lo cazó ninguna prueba automática porque `curl` no manda cabecera
     * `Origin` y un navegador la manda siempre.
     */
    expect(authBaseUrl({ ...BASE, claimedByTenant: true })).toBe("http://segundo.localhost:4321");
  });

  it("y uno registrado en sites.host también", () => {
    expect(authBaseUrl({ ...BASE, siteHost: "segundo.localhost" })).toBe(
      "http://segundo.localhost:4321"
    );
  });

  it("comparando el host sin el puerto", () => {
    // `sites.host` se guarda normalizado y la petición trae el puerto; compararlos crudos
    // haría que un dominio bien registrado no se reconociera en desarrollo.
    expect(
      authBaseUrl({
        ...BASE,
        requestOrigin: "https://cliente.com",
        requestHost: "cliente.com:443",
        siteHost: "cliente.com",
      })
    ).toBe("https://cliente.com");
  });

  it("un host que nadie ha dado de alta NO fabrica su propio origen", () => {
    /*
     * La otra mitad, y la que importa de verdad. El `baseURL` es con lo que se construyen los
     * enlaces que salen por correo: si el host de la petición se creyera sin más, quien pidiera
     * un enlace mágico con `Host: sitio-falso.com` conseguiría que a la víctima le llegue un
     * enlace con un token válido apuntando a su dominio.
     */
    expect(authBaseUrl({ ...BASE, requestOrigin: "http://sitio-falso.com" })).toBe(
      "http://localhost:4321"
    );
  });

  it("un sites.host distinto tampoco vale", () => {
    expect(authBaseUrl({ ...BASE, siteHost: "otro.com" })).toBe("http://localhost:4321");
  });

  it("sin nada configurado se usa el origen, que es el caso mono-sitio de siempre", () => {
    // Una instalación de un solo sitio sin BETTER_AUTH_URL responde en el dominio que sea, y
    // exigirle registro previo apagaría el acceso al desplegar en uno nuevo.
    expect(authBaseUrl({ ...BASE, configured: undefined })).toBe("http://segundo.localhost:4321");
  });
});
