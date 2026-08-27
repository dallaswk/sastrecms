import { and, eq, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";
import { nodes } from "@db/schema";

/**
 * The two filters every node query needs, defined once.
 *
 * There are nine places that query nodes. Adding a soft delete means every one of them has to
 * exclude the trash, and honouring `scheduled` means the public ones have to accept it — nine
 * chances to forget, and forgetting either is silent: deleted content stays live, or a scheduled
 * post never appears. So the conditions are built here and the query sites call them.
 */

/** Not in the trash. Everything the backoffice lists. */
export function activeNodes(siteId: string): SQL {
  return and(eq(nodes.siteId, siteId), isNull(nodes.deletedAt))!;
}

/** In the trash: what the trash view lists. */
export function trashedNodes(siteId: string): SQL {
  return and(eq(nodes.siteId, siteId), isNotNull(nodes.deletedAt))!;
}

/**
 * What the public site may serve: published, or scheduled with its moment passed.
 *
 * `now` is a parameter rather than read here so the caller decides it once per request — two
 * queries in the same render comparing against two different `now` values could include a node
 * in a listing and 404 on its page.
 */
export function visibleNodes(siteId: string, now: Date): SQL {
  return and(
    eq(nodes.siteId, siteId),
    isNull(nodes.deletedAt),
    or(
      eq(nodes.status, "published"),
      and(eq(nodes.status, "scheduled"), lte(nodes.publishAt, now))
    )
  )!;
}

/**
 * The same, for a preview: a draft is served too.
 *
 * Used only when a valid preview token names this node, so it is never reachable by guessing a
 * URL. The trash stays excluded even here — previewing something deleted is not a use case, it
 * is a bug report.
 */
export function previewableNodes(siteId: string): SQL {
  return and(eq(nodes.siteId, siteId), isNull(nodes.deletedAt))!;
}
