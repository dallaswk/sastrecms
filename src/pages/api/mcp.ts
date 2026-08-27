import type { APIRoute } from "astro";
import { validateApiToken } from "@lib/api-token";
import { getTool, listTools, initializeResult, SERVER_INFO } from "@lib/mcp/registry";
import { ToolError, type ToolContext } from "@lib/mcp/types";
import {
  parseRpcBody,
  isNotification,
  success,
  failure,
  batchResponse,
  RPC_ERRORS,
  type RpcRequest,
  type RpcResponse,
} from "@lib/mcp/jsonrpc";

export const prerender = false;

/**
 * The MCP endpoint.
 *
 * Speaks JSON-RPC 2.0 — `initialize`, `tools/list`, `tools/call` — which is what an actual MCP
 * client sends. It also still accepts the old `{tool, params}` shape, because that is what the
 * tokens already issued are calling, and breaking them to gain protocol purity would be a poor
 * trade.
 *
 * The dispatch is thin on purpose: the tools live in @lib/mcp, where each is one declaration
 * instead of a switch case plus an entry in a hand-written list that could disagree with it.
 */

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Never stored: every response here is scoped to one token.
      "Cache-Control": "private, no-store",
    },
  });
}

/** Maps a failure to a JSON-RPC error, so the code says what kind of failure it was. */
function errorFor(error: unknown) {
  if (error instanceof ToolError) {
    return {
      rpc: error.kind === "forbidden" ? RPC_ERRORS.forbidden : RPC_ERRORS.invalidParams,
      data: error.data,
      message: error.message,
    };
  }

  const message = error instanceof Error ? error.message : "Error interno";
  // The permission helpers throw plain Errors prefixed this way. Recognised here so a
  // permission failure does not read to the client as a server fault.
  if (/^Forbidden/i.test(message)) {
    return { rpc: RPC_ERRORS.forbidden, data: undefined, message };
  }
  return { rpc: RPC_ERRORS.internalError, data: undefined, message };
}

/**
 * The `tools/call` result shape.
 *
 * The value goes back as JSON inside a text block *and* as `structuredContent`: the content
 * array is what clients render for a person, the structured field is what a program parses.
 * Sending only one means either a human sees nothing or a program has to scrape prose.
 */
function toolResult(value: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    ...(value && typeof value === "object" && !Array.isArray(value)
      ? { structuredContent: value as Record<string, unknown> }
      : {}),
    isError: false,
  };
}

/**
 * An error *inside* a tool is a successful RPC call with `isError`, not an RPC failure: the
 * call did reach the tool, and a model has to be able to read the message and correct itself.
 * An RPC-level error is for the cases it cannot fix by sending different arguments.
 */
function toolErrorResult(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function runMethod(
  request: RpcRequest,
  context: ToolContext
): Promise<{ result: unknown } | { error: { code: number; message: string; data?: unknown } }> {
  const params = (request.params ?? {}) as Record<string, unknown>;

  switch (request.method) {
    case "initialize":
      return { result: initializeResult() };

    // Sent by clients right after initialize. Notifications, so nothing goes back.
    case "notifications/initialized":
    case "initialized":
      return { result: {} };

    case "ping":
      return { result: {} };

    case "tools/list":
      return { result: { tools: listTools() } };

    case "tools/call": {
      const name = String(params.name ?? "");
      const tool = getTool(name);
      if (!tool) {
        return {
          error: {
            ...RPC_ERRORS.methodNotFound,
            message: `No existe la herramienta "${name}"`,
            data: { available: listTools().map((t) => t.name) },
          },
        };
      }

      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        return { result: toolResult(await tool.handler(args, context)) };
      } catch (error) {
        const mapped = errorFor(error);
        if (mapped.rpc === RPC_ERRORS.internalError) {
          console.error("[MCP]", error);
        }
        if (mapped.rpc === RPC_ERRORS.forbidden || mapped.rpc === RPC_ERRORS.internalError) {
          return {
            error: {
              ...mapped.rpc,
              message: mapped.message,
              ...(mapped.data !== undefined ? { data: mapped.data } : {}),
            },
          };
        }
        const detail = mapped.data ? `\n${JSON.stringify(mapped.data)}` : "";
        return { result: toolErrorResult(mapped.message + detail) };
      }
    }

    default:
      return {
        error: { ...RPC_ERRORS.methodNotFound, message: `Método "${request.method}" no soportado` },
      };
  }
}

async function handleRpc(request: RpcRequest, context: ToolContext): Promise<RpcResponse | null> {
  const outcome = await runMethod(request, context);
  if (isNotification(request)) return null;
  const id = request.id ?? null;
  return "error" in outcome
    ? failure(id, outcome.error, outcome.error.data)
    : success(id, outcome.result);
}

export const POST: APIRoute = async ({ request, locals, cache }) => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Falta la cabecera Authorization: Bearer <token>" }, 401);
  }

  const tokenResult = await validateApiToken(locals.db, authHeader.slice(7));
  if (!tokenResult) {
    return json({ error: "Token inválido o revocado" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(failure(null, RPC_ERRORS.parseError), 400);
  }

  const context: ToolContext = {
    db: locals.db,
    siteId: locals.siteId,
    userId: tokenResult.userId,
    cache,
    r2: locals.r2,
    env: (locals.env ?? {}) as unknown as Record<string, unknown>,
    defaultLocale: locals.site?.defaultLocale ?? "es",
  };

  /*
   * The legacy shape: {tool, params}.
   *
   * Answered in its own envelope so an existing caller sees no change at all.
   */
  if (body && typeof body === "object" && !Array.isArray(body) && "tool" in (body as object)) {
    const legacy = body as { tool: string; params?: Record<string, unknown> };
    const tool = getTool(legacy.tool);
    if (!tool) return json({ error: `Herramienta desconocida: ${legacy.tool}` }, 404);

    try {
      return json({ result: await tool.handler(legacy.params ?? {}, context) });
    } catch (error) {
      const mapped = errorFor(error);
      if (mapped.rpc === RPC_ERRORS.internalError) console.error("[MCP]", error);
      const status =
        mapped.rpc === RPC_ERRORS.forbidden
          ? 403
          : mapped.rpc === RPC_ERRORS.internalError
            ? 500
            : 400;
      return json({ error: mapped.message, ...(mapped.data ? { data: mapped.data } : {}) }, status);
    }
  }

  const parsed = parseRpcBody(body);
  if (parsed.kind === "error") return json(parsed.response, 400);

  if (parsed.kind === "single") {
    const response = await handleRpc(parsed.request, context);
    // A notification gets 202 with no body, which is what the spec asks for.
    return response ? json(response) : new Response(null, { status: 202 });
  }

  const responses: RpcResponse[] = [];
  for (const item of parsed.requests) {
    if (
      !item ||
      typeof item !== "object" ||
      item.jsonrpc !== "2.0" ||
      typeof item.method !== "string"
    ) {
      responses.push(failure(null, RPC_ERRORS.invalidRequest));
      continue;
    }
    const response = await handleRpc(item, context);
    if (response) responses.push(response);
  }

  const batch = batchResponse(responses);
  return batch ? json(batch) : new Response(null, { status: 202 });
};

/**
 * Discovery over GET.
 *
 * Unauthenticated and deliberately thin: it says what this is and which protocol it speaks, so
 * a client can find out how to talk to it before it has a token. The tool list is *not* here —
 * that needs a token, because enumerating the write surface of a CMS to anybody who asks is
 * free reconnaissance.
 */
export const GET: APIRoute = async ({ url }) => {
  return json({
    ...SERVER_INFO,
    protocol: "jsonrpc-2.0",
    endpoint: new URL("/api/mcp", url.origin).toString(),
    methods: ["initialize", "tools/list", "tools/call", "ping"],
    authentication: "Bearer <token de /admin/tokens>",
    note: "Se acepta también el formato antiguo {tool, params} para los tokens ya emitidos.",
  });
};
