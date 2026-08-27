/**
 * List operations for the repeater and the sections editor.
 *
 * Pure and testable, same split as nodeTreeContext.ts: the components own rendering and
 * drag wiring, this module owns what happens to the array. Reordering lists is where the
 * tree already went wrong once, so it gets tested here rather than through the DOM.
 */

/** A local, non-persisted identity used only as a `:key` while items are dragged. */
export type WithLocalId<T> = T & { _lid: string };

let counter = 0;

/**
 * Local ids for `:key`.
 *
 * Repeater items have no identity of their own — nothing in the stored JSON distinguishes
 * item 2 from item 3 — so using the array index as `:key` makes Vue reuse the wrong DOM
 * node when items move, and the classic symptom is text jumping between rows mid-drag.
 * Section instances *do* carry a persisted `id`, which is why they don't need this.
 *
 * Not crypto: these never leave the browser and never reach the database.
 */
export function withLocalIds<T extends object>(items: T[]): WithLocalId<T>[] {
  return items.map((item) => ({ ...item, _lid: `lid_${++counter}` }));
}

export function stripLocalIds<T extends object>(items: WithLocalId<T>[]): T[] {
  return items.map(({ _lid, ...rest }) => rest as unknown as T);
}

export function addItem<T>(items: T[], item: T, at?: number): T[] {
  const next = items.slice();
  next.splice(at ?? next.length, 0, item);
  return next;
}

export function removeItem<T>(items: T[], index: number): T[] {
  if (index < 0 || index >= items.length) return items.slice();
  const next = items.slice();
  next.splice(index, 1);
  return next;
}

/** Moves an item, clamping the destination instead of dropping it off the end. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items.slice();
  const next = items.slice();
  const [item] = next.splice(from, 1);
  const target = Math.max(0, Math.min(to, next.length));
  next.splice(target, 0, item);
  return next;
}

export function duplicateItem<T>(items: T[], index: number): T[] {
  if (index < 0 || index >= items.length) return items.slice();
  const copy = structuredClone(items[index]);
  return addItem(items, copy, index + 1);
}

/** Replaces one item without mutating the array, so Vue sees a new reference. */
export function replaceItem<T>(items: T[], index: number, item: T): T[] {
  if (index < 0 || index >= items.length) return items.slice();
  const next = items.slice();
  next[index] = item;
  return next;
}

/** Whatever is stored, read it as a list: a missing value or a stray object is not a crash. */
export function asList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object");
}
