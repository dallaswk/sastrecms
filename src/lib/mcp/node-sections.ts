import { and, eq } from "drizzle-orm";
import { nodes } from "@db/schema";
import { parseSections } from "@lib/sections/validate";
import { sectionsFieldOf } from "@lib/renderers";
import type { SectionInstance } from "@lib/sections/types";
import { ToolError, type ToolContext } from "./types";

/**
 * Reading and writing a node's section list.
 *
 * Shared by every section tool so the guards are in one place: the node has to exist on this
 * site, its type has to have a sections field, and whatever comes back from the database has
 * to go through `parseSections` before an agent is told it is the current state. An agent
 * handed unvalidated blocks would faithfully copy a broken one back.
 */

export type LoadedSections = {
  node: typeof nodes.$inferSelect;
  /** The field key the blocks live under — `bloques` by convention, but not guaranteed. */
  key: string;
  sections: SectionInstance[];
  /** Blocks the parser refused. Reported to the agent rather than silently dropped. */
  invalid: { index: number; type?: string; message: string }[];
};

export async function loadSections(
  context: ToolContext,
  nodeId: string
): Promise<LoadedSections> {
  const node = await context.db.query.nodes.findFirst({
    where: and(eq(nodes.id, nodeId), eq(nodes.siteId, context.siteId)),
    with: { contentType: true },
  });
  if (!node) throw new ToolError(`No existe el nodo "${nodeId}"`, "notFound");

  const field = sectionsFieldOf(node.contentType ?? null);
  if (!field) {
    throw new ToolError(
      `El tipo "${node.contentType?.key ?? "?"}" no tiene constructor de secciones, así que esta página no se compone de bloques.`,
      "invalidParams"
    );
  }

  const stored = (node.fields ?? {}) as Record<string, unknown>;
  const parsed = parseSections(stored[field.key]);

  return {
    node,
    key: field.key,
    sections: parsed.sections,
    invalid: parsed.errors.map((error) => ({
      index: error.index,
      ...(error.type ? { type: error.type } : {}),
      message: error.message,
    })),
  };
}

/** Finds a block by id, with an error that names what is actually there. */
export function requireSection(
  loaded: LoadedSections,
  sectionId: string
): { section: SectionInstance; index: number } {
  const index = loaded.sections.findIndex((section) => section.id === sectionId);
  if (index === -1) {
    const available = loaded.sections.map((s) => `${s.id} (${s.type})`).join(", ") || "ninguno";
    throw new ToolError(
      `La página no tiene un bloque "${sectionId}". Tiene: ${available}.`,
      "notFound"
    );
  }
  return { section: loaded.sections[index]!, index };
}
