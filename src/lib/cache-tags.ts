/**
 * The cache tag taxonomy.
 *
 * The whole risk in tag-based caching is that the tag a page is *stored* under and the tag an
 * update *purges* are computed in different places, and drift. A stale page is silent — it
 * looks exactly like a working one — so the only defence is that both sides call the same
 * function. That is all this file is.
 *
 * Plain TypeScript, no imports: called from routes, from actions and from the MCP endpoint.
 */

/** Everything public on a site. The blunt instrument, for a settings change. */
export function siteTag(siteId: string): string {
  return `site:${siteId}`;
}

/** One page. Purged when that page is edited. */
export function nodeTag(nodeId: string): string {
  return `node:${nodeId}`;
}

/**
 * Every page of a content type.
 *
 * Needed because a post appears on its own page *and* in the listing and in any `collection`
 * block that points at its type — so editing one post has to purge more than that post.
 */
export function typeTag(contentTypeId: string): string {
  return `type:${contentTypeId}`;
}

/** The chrome: header, footer, menus, palette. Changing a menu changes every page. */
export function chromeTag(siteId: string): string {
  return `chrome:${siteId}`;
}

/**
 * The tags a public page is stored under.
 *
 * A page carries its own tag, its type's tag, the chrome tag and the site tag, so any of the
 * four levels of change can reach it. Tagging is cheap; a missed purge is not.
 */
export function tagsForNode(input: {
  siteId: string;
  nodeId: string;
  contentTypeId?: string | null;
  /** Ids of nodes whose content this page also renders, e.g. a listing's entries. */
  referencedNodeIds?: string[];
  /** Types this page lists, from a `collection` block. */
  referencedTypeIds?: string[];
}): string[] {
  const tags = new Set<string>([
    siteTag(input.siteId),
    chromeTag(input.siteId),
    nodeTag(input.nodeId),
  ]);

  if (input.contentTypeId) tags.add(typeTag(input.contentTypeId));
  for (const id of input.referencedNodeIds ?? []) tags.add(nodeTag(id));
  for (const id of input.referencedTypeIds ?? []) tags.add(typeTag(id));

  return [...tags];
}

/**
 * The tags to purge when a node changes.
 *
 * Includes the type tag, not just the node's own: publishing a post must also drop the blog
 * listing and every page with a `collection` block pointing at posts. Getting this wrong is
 * the classic "I published it and the homepage still shows the old three".
 */
export function tagsToPurgeForNode(input: {
  siteId: string;
  nodeId: string;
  contentTypeId?: string | null;
  /** Set when the node moved, so the old parent's listing is dropped as well. */
  previousParentId?: string | null;
  parentId?: string | null;
}): string[] {
  const tags = new Set<string>([nodeTag(input.nodeId)]);
  if (input.contentTypeId) tags.add(typeTag(input.contentTypeId));
  if (input.parentId) tags.add(nodeTag(input.parentId));
  if (input.previousParentId) tags.add(nodeTag(input.previousParentId));
  return [...tags];
}

/** Changing settings changes the chrome of every page, and possibly the palette. */
export function tagsToPurgeForSettings(siteId: string): string[] {
  return [chromeTag(siteId), siteTag(siteId)];
}

/**
 * How long a public page may be served from the edge.
 *
 * Long, because purging is explicit: the numbers only matter for a change that happens
 * outside the CMS — a scheduled publish, or a purge that failed. `swr` is what keeps a
 * visitor from ever waiting on a revalidation.
 */
export const PUBLIC_CACHE = { maxAge: 3600, swr: 86400 } as const;
