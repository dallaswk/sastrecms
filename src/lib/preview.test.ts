import { describe, it, expect } from "vitest";
import {
  createPreviewToken,
  verifyPreviewToken,
  previewUrl,
  PREVIEW_PARAM,
  DEFAULT_PREVIEW_TTL_SECONDS,
} from "./preview";

const SECRET = "un-secreto-de-prueba";
const NOW = new Date("2026-08-27T12:00:00Z");

describe("createPreviewToken / verifyPreviewToken", () => {
  it("un token recién hecho vale, y dice para qué nodo", async () => {
    const token = await createPreviewToken("node_abc", SECRET, NOW);
    const check = await verifyPreviewToken(token, SECRET, NOW);
    expect(check.valid).toBe(true);
    if (check.valid) expect(check.nodeId).toBe("node_abc");
  });

  it("caduca", async () => {
    const token = await createPreviewToken("node_abc", SECRET, NOW, 60);
    const later = new Date(NOW.getTime() + 61_000);
    const check = await verifyPreviewToken(token, SECRET, later);
    expect(check.valid).toBe(false);
    if (!check.valid) expect(check.reason).toBe("expired");
  });

  it("un token de una página no sirve para otra", async () => {
    // El id va dentro de la firma, así que cambiarlo en la URL la invalida.
    const token = await createPreviewToken("node_abc", SECRET, NOW);
    const moved = token.replace("node_abc", "node_otro");
    const check = await verifyPreviewToken(moved, SECRET, NOW);
    expect(check.valid).toBe(false);
    if (!check.valid) expect(check.reason).toBe("bad-signature");
  });

  it("no se puede alargar la caducidad editando la URL", async () => {
    const token = await createPreviewToken("node_abc", SECRET, NOW, 60);
    const [id, expiry, sig] = token.split(".");
    const extended = `${id}.${Number(expiry) + 999999}.${sig}`;
    const check = await verifyPreviewToken(extended, SECRET, NOW);
    expect(check.valid).toBe(false);
    if (!check.valid) expect(check.reason).toBe("bad-signature");
  });

  it("con otro secreto no vale: rotar el secreto revoca todos los enlaces", async () => {
    const token = await createPreviewToken("node_abc", SECRET, NOW);
    const check = await verifyPreviewToken(token, "otro-secreto", NOW);
    expect(check.valid).toBe(false);
    if (!check.valid) expect(check.reason).toBe("bad-signature");
  });

  it("un token forjado no revela que el formato era correcto", async () => {
    // Decir «caducado» a algo falsificado le confirma al que lo forjó que acertó el formato.
    const check = await verifyPreviewToken("node_abc.1000000000.firmafalsa", SECRET, NOW);
    expect(check.valid).toBe(false);
    if (!check.valid) expect(check.reason).toBe("bad-signature");
  });

  it("basura es «malformed», sin lanzar", async () => {
    for (const value of [null, undefined, "", "abc", "a.b", "a.b.c.d", 42, "node.noesunnumero.x"]) {
      const check = await verifyPreviewToken(value, SECRET, NOW);
      expect(check.valid, String(value)).toBe(false);
    }
  });

  it("el token es seguro en una URL: nada que escapar", async () => {
    const token = await createPreviewToken("node_abc", SECRET, NOW);
    expect(token).toBe(encodeURIComponent(token));
  });

  it("dos días por defecto: suficiente para mandarlo y recibir respuesta", () => {
    expect(DEFAULT_PREVIEW_TTL_SECONDS).toBe(60 * 60 * 48);
  });
});

describe("previewUrl", () => {
  it("añade el parámetro sin perder la ruta", async () => {
    const token = await createPreviewToken("node_abc", SECRET, NOW);
    const url = previewUrl("https://cliente.test", "/servicios/reformas", token);
    expect(url).toContain("https://cliente.test/servicios/reformas?");
    expect(new URL(url).searchParams.get(PREVIEW_PARAM)).toBe(token);
  });
});
