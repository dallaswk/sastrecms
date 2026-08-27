import type { InjectionKey } from "vue";

/**
 * One media picker modal per form, shared by every image and gallery field.
 *
 * Mounting a MediaPickerModal inside each field component would put one modal in the DOM
 * per field — a page with twenty sections would mount twenty, each with its own
 * MediaManager fetching the library. Same pattern as NodeTree: the root owns the state
 * and `provide()`s access to it.
 *
 * The promise-based shape replaces the old `pickerTargetField` string: a field awaits its
 * own selection instead of the form having to remember whose turn it was.
 */
export interface MediaPickerContext {
  /** Resolves with the chosen URLs, or an empty array if the modal was dismissed. */
  pick(multiple: boolean): Promise<string[]>;
}

export const MEDIA_PICKER_KEY: InjectionKey<MediaPickerContext> = Symbol("mediaPicker");
