import { messageFrom } from "@lib/toast";
import type { toast as ToastApi } from "./toast";

/**
 * What a Vue island calls.
 *
 * It has to go through `window`, not through an import: every island is bundled separately, so
 * importing the toast module inside one would give it a private copy of the stack — its toasts
 * would render into a container that the layout's copy immediately overwrites. The layout
 * mounts the real one and publishes it on `window`; this is the handle.
 *
 * Falls back to a no-op rather than throwing: a component should not break because a toast
 * could not be shown.
 */
function api(): typeof ToastApi | null {
  return typeof window !== "undefined" ? (window.sastreToast ?? null) : null;
}

export const notify = {
  success: (message: string) => api()?.success(message),
  error: (message: string) => api()?.error(message),
  warning: (message: string) => api()?.warning(message),
  info: (message: string) => api()?.info(message),
  /** Takes whatever a failed call produced — action error, Error, string — and says it. */
  fromError: (error: unknown, fallback?: string) => {
    const shown = api();
    if (shown) shown.error(messageFrom(error, fallback));
    else console.error("[sASTRe]", error);
  },
};
