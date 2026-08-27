import { describe, it, expect } from "vitest";
import {
  isRpcRequest,
  isNotification,
  parseRpcBody,
  success,
  failure,
  batchResponse,
  RPC_ERRORS,
  JSONRPC_VERSION,
} from "./jsonrpc";

describe("isRpcRequest", () => {
  it("acepta una petición bien formada", () => {
    expect(isRpcRequest({ jsonrpc: "2.0", method: "tools/list" })).toBe(true);
  });

  it("rechaza una versión que no es 2.0", () => {
    expect(isRpcRequest({ jsonrpc: "1.0", method: "x" })).toBe(false);
    expect(isRpcRequest({ method: "x" })).toBe(false);
  });

  it("rechaza lo que no tiene método", () => {
    expect(isRpcRequest({ jsonrpc: "2.0" })).toBe(false);
    expect(isRpcRequest({ jsonrpc: "2.0", method: 42 })).toBe(false);
  });

  it("rechaza un array y basura", () => {
    expect(isRpcRequest([])).toBe(false);
    expect(isRpcRequest(null)).toBe(false);
    expect(isRpcRequest("nope")).toBe(false);
  });
});

describe("isNotification", () => {
  it("sin id es una notificación, y no se contesta", () => {
    expect(isNotification({ jsonrpc: "2.0", method: "x" })).toBe(true);
    expect(isNotification({ jsonrpc: "2.0", method: "x", id: undefined })).toBe(true);
  });

  it("id 0 y null son ids, no ausencias", () => {
    // Un `if (!id)` aquí trataría el 0 como notificación y el cliente se quedaría esperando.
    expect(isNotification({ jsonrpc: "2.0", method: "x", id: 0 })).toBe(false);
    expect(isNotification({ jsonrpc: "2.0", method: "x", id: null })).toBe(false);
  });
});

describe("parseRpcBody", () => {
  it("una petición suelta", () => {
    const result = parseRpcBody({ jsonrpc: "2.0", method: "tools/list", id: 1 });
    expect(result.kind).toBe("single");
  });

  it("un lote", () => {
    const result = parseRpcBody([{ jsonrpc: "2.0", method: "a", id: 1 }]);
    expect(result.kind).toBe("batch");
  });

  it("un lote vacío es Invalid Request según la especificación", () => {
    const result = parseRpcBody([]);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.response.error.code).toBe(RPC_ERRORS.invalidRequest.code);
  });

  it("devuelve el error dentro de un sobre JSON-RPC, no un 400 pelado", () => {
    const result = parseRpcBody({ hola: "mundo" });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.response.jsonrpc).toBe(JSONRPC_VERSION);
      expect(result.response.id).toBeNull();
    }
  });

  it("devuelve el id cuando se puede leer, para que el cliente empareje el error", () => {
    const result = parseRpcBody({ jsonrpc: "1.0", method: "x", id: 7 });
    if (result.kind === "error") expect(result.response.id).toBe(7);
  });
});

describe("success / failure", () => {
  it("el sobre lleva versión e id", () => {
    expect(success(3, { ok: true })).toEqual({ jsonrpc: "2.0", id: 3, result: { ok: true } });
  });

  it("un error sin data no emite la clave", () => {
    const response = failure(1, RPC_ERRORS.methodNotFound);
    expect("data" in response.error).toBe(false);
  });

  it("un error con data la lleva", () => {
    const response = failure(1, RPC_ERRORS.invalidParams, { field: "slug" });
    expect(response.error.data).toEqual({ field: "slug" });
  });

  it("los códigos son los estándar", () => {
    expect(RPC_ERRORS.parseError.code).toBe(-32700);
    expect(RPC_ERRORS.methodNotFound.code).toBe(-32601);
    expect(RPC_ERRORS.invalidParams.code).toBe(-32602);
    // Los propios van en el rango reservado a la implementación.
    expect(RPC_ERRORS.forbidden.code).toBeLessThanOrEqual(-32000);
    expect(RPC_ERRORS.forbidden.code).toBeGreaterThanOrEqual(-32099);
  });
});

describe("batchResponse", () => {
  it("un lote de sólo notificaciones no devuelve cuerpo", () => {
    // Devolver [] ahí es una violación que algunos clientes leen como error.
    expect(batchResponse([])).toBeNull();
  });

  it("con respuestas devuelve el array", () => {
    expect(batchResponse([success(1, "a")])).toHaveLength(1);
  });
});
