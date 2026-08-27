/**
 * JSON-RPC 2.0, the part with no I/O in it.
 *
 * Kept separate from the route because the error codes and the batch handling are exactly the
 * sort of thing that is wrong in a way no manual test notices — a client sees a response and
 * assumes it worked. Everything here is testable without a request.
 *
 * https://www.jsonrpc.org/specification
 */

export const JSONRPC_VERSION = "2.0";

/** The standard error codes. -32000 to -32099 are reserved for implementation errors. */
export const RPC_ERRORS = {
  parseError: { code: -32700, message: "Parse error" },
  invalidRequest: { code: -32600, message: "Invalid Request" },
  methodNotFound: { code: -32601, message: "Method not found" },
  invalidParams: { code: -32602, message: "Invalid params" },
  internalError: { code: -32603, message: "Internal error" },
  /** Implementation-defined: the caller is authenticated but not allowed. */
  forbidden: { code: -32001, message: "Forbidden" },
  unauthorized: { code: -32000, message: "Unauthorized" },
} as const;

export type RpcId = string | number | null;

export type RpcRequest = {
  jsonrpc: string;
  method: string;
  params?: unknown;
  /** Absent means a notification: no response is sent at all. */
  id?: RpcId;
};

export type RpcSuccess = { jsonrpc: string; id: RpcId; result: unknown };
export type RpcFailure = {
  jsonrpc: string;
  id: RpcId;
  error: { code: number; message: string; data?: unknown };
};
export type RpcResponse = RpcSuccess | RpcFailure;

/** True when the object is shaped like a request. Deliberately lenient about `params`. */
export function isRpcRequest(value: unknown): value is RpcRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.jsonrpc === JSONRPC_VERSION && typeof candidate.method === "string";
}

/** A request with no `id` is a notification, and the spec says to send nothing back. */
export function isNotification(request: RpcRequest): boolean {
  return !("id" in request) || request.id === undefined;
}

export function success(id: RpcId, result: unknown): RpcSuccess {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

export function failure(
  id: RpcId,
  error: { code: number; message: string },
  data?: unknown
): RpcFailure {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: { ...error, ...(data !== undefined ? { data } : {}) },
  };
}

/**
 * Parses a body into the requests to run.
 *
 * Returns a failure response instead of throwing, because a parse error still has to be
 * answered with a well-formed JSON-RPC envelope — a client that gets a bare 400 with an HTML
 * body has no idea what happened.
 */
export type ParseResult =
  | { kind: "single"; request: RpcRequest }
  | { kind: "batch"; requests: RpcRequest[] }
  | { kind: "error"; response: RpcFailure };

export function parseRpcBody(body: unknown): ParseResult {
  if (Array.isArray(body)) {
    // An empty batch is explicitly Invalid Request in the spec.
    if (body.length === 0) {
      return { kind: "error", response: failure(null, RPC_ERRORS.invalidRequest) };
    }
    return { kind: "batch", requests: body as RpcRequest[] };
  }

  if (!isRpcRequest(body)) {
    // The id is echoed when it can be read, so a client can match the error to its call.
    const id =
      body && typeof body === "object" && "id" in (body as Record<string, unknown>)
        ? ((body as Record<string, unknown>).id as RpcId)
        : null;
    return { kind: "error", response: failure(id, RPC_ERRORS.invalidRequest) };
  }

  return { kind: "single", request: body };
}

/**
 * The response body for a batch.
 *
 * Notifications produce nothing, so a batch made only of notifications produces no body at
 * all — returning `[]` there is a spec violation that some clients treat as an error.
 */
export function batchResponse(responses: RpcResponse[]): RpcResponse[] | null {
  return responses.length > 0 ? responses : null;
}
