import { describe, it, expect } from "vitest";
import { SECURITY_HEADERS, HSTS_HEADER, buildCsp } from "./headers";

const directives = (csp: string) =>
  Object.fromEntries(
    csp.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    })
  ) as Record<string, string[]>;

describe("SECURITY_HEADERS", () => {
  it("niega el enmarcado del todo, no sólo desde otro origen", () => {
    // SAMEORIGIN aún deja que una página con XSS almacenado enmarque el backoffice.
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
  });

  it("cubre las cabeceras que un escáner busca", () => {
    for (const name of [
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
    ]) {
      expect(SECURITY_HEADERS[name], name).toBeTruthy();
    }
  });

  it("HSTS va aparte, porque sobre HTTP no significa nada", () => {
    expect("Strict-Transport-Security" in SECURITY_HEADERS).toBe(false);
    expect(HSTS_HEADER).toContain("includeSubDomains");
  });
});

describe("buildCsp", () => {
  it("strict-dynamic está, que es lo que hace viable la política", () => {
    // Sin él habría que enumerar cada host de cada proveedor, una lista que caduca en cuanto
    // uno cambia de CDN.
    const d = directives(buildCsp());
    expect(d["script-src"]).toContain("'strict-dynamic'");
  });

  it("unsafe-inline va después de strict-dynamic, no antes", () => {
    // Un navegador con strict-dynamic lo ignora; uno sin él lo necesita, porque Astro emite
    // precargas de módulos en línea. Es el patrón documentado, no una escapatoria.
    const script = directives(buildCsp())["script-src"];
    expect(script.indexOf("'strict-dynamic'")).toBeLessThan(script.indexOf("'unsafe-inline'"));
  });

  it("nada se puede enmarcar ni enviar un formulario a otro sitio", () => {
    const d = directives(buildCsp());
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
  });

  it("Turnstile siempre está permitido: el formulario no funciona sin él", () => {
    const d = directives(buildCsp());
    expect(d["script-src"]).toContain("https://challenges.cloudflare.com");
    expect(d["frame-src"]).toContain("https://challenges.cloudflare.com");
  });

  it("sin analítica configurada no se permite ningún host de tracker", () => {
    const csp = buildCsp();
    for (const host of ["googletagmanager", "facebook", "tiktok", "hotjar"]) {
      expect(csp, host).not.toContain(host);
    }
  });

  it("con analítica se permiten, y sólo entonces", () => {
    const csp = buildCsp({ allowAnalytics: true });
    expect(csp).toContain("https://www.googletagmanager.com");
    expect(csp).toContain("https://connect.facebook.net");
  });

  it("el host de medios se nombra en vez de permitir cualquier https", () => {
    const d = directives(buildCsp({ mediaHost: "https://media.cliente.test" }));
    expect(d["img-src"]).toContain("https://media.cliente.test");
    expect(d["img-src"]).not.toContain("https:");
  });

  it("las fuentes de Google están permitidas, que es la única excepción del proyecto", () => {
    const d = directives(buildCsp());
    expect(d["style-src"]).toContain("https://fonts.googleapis.com");
    expect(d["font-src"]).toContain("https://fonts.gstatic.com");
  });

  it("fuerza https en cualquier subrecurso", () => {
    expect(buildCsp()).toContain("upgrade-insecure-requests");
  });

  it("no emite una directiva vacía, que un navegador interpreta como «nada permitido»", () => {
    for (const [name, values] of Object.entries(directives(buildCsp()))) {
      if (name === "upgrade-insecure-requests") continue;
      expect(values.length, name).toBeGreaterThan(0);
    }
  });
});
