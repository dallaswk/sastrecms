import { describe, it, expect } from "vitest";
import { honeypotTripped, hashIp, clientIp, rateVerdict, rateWindows } from "./guards";
import { HONEYPOT_FIELD, RATE_LIMIT } from "./types";

describe("honeypotTripped", () => {
  it("salta sólo si el campo trampa lleva algo", () => {
    expect(honeypotTripped({ nombre: "Ana" })).toBe(false);
    expect(honeypotTripped({ [HONEYPOT_FIELD]: "" })).toBe(false);
    expect(honeypotTripped({ [HONEYPOT_FIELD]: "   " })).toBe(false);
    expect(honeypotTripped({ [HONEYPOT_FIELD]: "http://spam.test" })).toBe(true);
  });

  it("no lanza con basura", () => {
    expect(honeypotTripped(null)).toBe(false);
    expect(honeypotTripped("nope")).toBe(false);
  });
});

describe("hashIp", () => {
  it("la misma IP da el mismo hash, que es lo que necesita el contador", async () => {
    const a = await hashIp("81.32.4.5", "secreto");
    const b = await hashIp("81.32.4.5", "secreto");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("la sal cambia el hash, así que un volcado de la tabla no se puede cruzar", async () => {
    expect(await hashIp("81.32.4.5", "uno")).not.toBe(await hashIp("81.32.4.5", "otro"));
  });

  it("nunca guarda la IP en claro", async () => {
    const hash = await hashIp("81.32.4.5", "secreto");
    expect(hash).not.toContain("81.32");
  });

  it("sin IP no hay hash", async () => {
    expect(await hashIp(null, "secreto")).toBeNull();
  });
});

describe("clientIp", () => {
  it("prefiere la cabecera que pone Cloudflare, no la que puede falsear el cliente", () => {
    const headers = new Headers({ "CF-Connecting-IP": "81.32.4.5", "X-Forwarded-For": "1.1.1.1" });
    expect(clientIp(headers)).toBe("81.32.4.5");
  });

  it("cae a X-Forwarded-For sólo si no hay otra", () => {
    expect(clientIp(new Headers({ "X-Forwarded-For": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("rateVerdict", () => {
  it("deja pasar por debajo del tope", () => {
    expect(rateVerdict({ fromIp: RATE_LIMIT.perIp.max - 1, fromSite: 0 }).allowed).toBe(true);
  });

  it("corta al alcanzar el tope por IP, no al superarlo", () => {
    const verdict = rateVerdict({ fromIp: RATE_LIMIT.perIp.max, fromSite: 0 });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toContain(String(RATE_LIMIT.perIp.windowMinutes));
  });

  it("el tope por sitio protege de una inundación repartida entre muchas IP", () => {
    expect(rateVerdict({ fromIp: 0, fromSite: RATE_LIMIT.perSite.max }).allowed).toBe(false);
  });
});

describe("rateWindows", () => {
  it("las ventanas se cuentan hacia atrás desde el ahora que se le pasa", () => {
    const now = new Date("2026-08-27T12:00:00Z");
    const windows = rateWindows(now);
    expect(windows.ip.toISOString()).toBe("2026-08-27T11:50:00.000Z");
    expect(windows.site.toISOString()).toBe("2026-08-27T11:00:00.000Z");
  });
});
