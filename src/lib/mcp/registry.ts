import { contentTools } from "./tools/content";
import { sectionTools } from "./tools/sections";
import { authoringTools } from "./tools/authoring";
import type { ToolDefinition } from "./types";

/**
 * Every tool, in one place.
 *
 * `tools/list` is derived from this, so the list an agent reads and the handlers that run are
 * the same declaration. Before, the list was a hand-written array next to the switch — a tool
 * renamed in one and not the other was a tool an agent could see and not call.
 */
export const TOOLS: ToolDefinition[] = [...contentTools, ...sectionTools, ...authoringTools];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function getTool(name: string): ToolDefinition | undefined {
  return BY_NAME.get(name);
}

/** The MCP `tools/list` shape. */
export function listTools() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      readOnlyHint: !tool.mutates,
      // Every write here is addressed by id and validated, so a repeat is a no-op or an
      // overwrite with the same value rather than a second insert.
      idempotentHint: !!tool.mutates,
    },
  }));
}

export const SERVER_INFO = {
  name: "sastre-cms",
  title: "sASTRe CMS",
  version: "0.2.0",
} as const;

/** What `initialize` answers. */
export const PROTOCOL_VERSION = "2025-06-18";

export function initializeResult() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    // Only tools. No resources, no prompts: advertising a capability that is not implemented
    // makes a client call it and fail.
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions:
      "CMS de un solo sitio. Para componer páginas: describe_sections primero (trae un ejemplo " +
      "válido de cada bloque), luego create_page_from_sections o get_sections + patch_section. " +
      "patch_section cambia un bloque sin reenviar los demás. Las páginas nacen como borrador; " +
      "publicar es una llamada aparte.",
  };
}
