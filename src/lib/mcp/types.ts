import type { Database } from "@db/client";

/**
 * A tool, declared as data.
 *
 * The switch statement and the hand-written list in the GET handler could already disagree —
 * a tool renamed in one and not the other, or added to the switch and never advertised. As
 * data there is one declaration, and `tools/list` is derived from it.
 */
export type ToolContext = {
  db: Database;
  siteId: string;
  userId: string;
  /** For purging the edge cache after a write. Absent in development. */
  cache?: { invalidate?: (options: { tags?: string | string[] }) => Promise<void> };
  /** The R2 bucket, for media uploads. Null when not configured. */
  r2: R2Bucket | null;
  env: Record<string, unknown>;
  defaultLocale: string;
};

export type ToolDefinition = {
  name: string;
  /** One line, read by a model choosing a tool. Say what it is *for*. */
  description: string;
  /** JSON Schema for `params`. What `tools/list` publishes. */
  inputSchema: Record<string, unknown>;
  /** True when the tool writes. Used to describe the surface, and to reason about safety. */
  mutates?: boolean;
  handler: (params: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
};

/** Thrown by a handler to produce a clean error rather than an internal one. */
export class ToolError extends Error {
  constructor(
    message: string,
    readonly kind: "invalidParams" | "forbidden" | "notFound" | "conflict" = "invalidParams",
    readonly data?: unknown
  ) {
    super(message);
    this.name = "ToolError";
  }
}

/** Shorthand for the common shape: an object schema with described properties. */
export function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = []
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

export const S = {
  string: (description: string) => ({ type: "string", description }),
  number: (description: string) => ({ type: "number", description }),
  boolean: (description: string) => ({ type: "boolean", description }),
  enum: (description: string, values: readonly string[]) => ({
    type: "string",
    description,
    enum: [...values],
  }),
  object: (description: string) => ({ type: "object", description, additionalProperties: true }),
  array: (description: string, items: unknown = { type: "object" }) => ({
    type: "array",
    description,
    items,
  }),
} as const;
