import { tagsToPurgeForNode, tagsToPurgeForSettings } from "./cache-tags";

/**
 * Purging the edge cache after a write.
 *
 * Wrapped rather than called directly for one reason: it must never be able to fail the
 * write. The content is already saved by the time this runs, and throwing here would tell
 * the editor their change was rejected when it was not — they would try again and, on a
 * second failure, conclude the CMS is broken. A purge that did not happen shows up as a page
 * that is stale for up to an hour; a write that appears to have failed loses the work.
 *
 * `cache` is typed loosely because the same call comes from an Astro action context and from
 * an API route context, and in development the provider is a noop with no `invalidate`.
 */
type Invalidator = { invalidate?: (options: { tags?: string | string[] }) => Promise<void> } | undefined;

async function purge(cache: Invalidator, tags: string[]): Promise<void> {
  if (!cache?.invalidate || tags.length === 0) return;
  try {
    await cache.invalidate({ tags });
  } catch {
    // Deliberately swallowed. See above.
  }
}

export async function invalidateNode(
  cache: Invalidator,
  input: Parameters<typeof tagsToPurgeForNode>[0]
): Promise<void> {
  await purge(cache, tagsToPurgeForNode(input));
}

export async function invalidateSettings(cache: Invalidator, siteId: string): Promise<void> {
  await purge(cache, tagsToPurgeForSettings(siteId));
}
