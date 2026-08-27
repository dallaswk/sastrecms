/**
 * Toast state, without the DOM.
 *
 * The rendering is twenty lines; what is actually easy to get wrong is the state — a bulk
 * action that fires twenty identical messages, an error that disappears before it is read, a
 * queue that leaks timers. All of that is here and tested; the DOM part just draws it.
 */

export const TOAST_KINDS = ["success", "error", "warning", "info"] as const;
export type ToastKind = (typeof TOAST_KINDS)[number];

export type ToastInput = {
  kind: ToastKind;
  message: string;
  /** Milliseconds. 0 means it stays until dismissed. */
  duration?: number;
  /** A single action, e.g. «Deshacer». The id is what the caller reacts to. */
  action?: { label: string; id: string };
};

export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  duration: number;
  action?: { label: string; id: string };
  /** How many identical messages collapsed into this one. */
  count: number;
};

/**
 * Errors do not auto-dismiss.
 *
 * An error is the one message a person has to finish reading, and it usually carries something
 * to act on — a field name, a reason a save failed. A four-second error is an error nobody
 * read, which is indistinguishable from no message at all.
 */
export const DEFAULT_DURATIONS: Record<ToastKind, number> = {
  success: 3500,
  info: 4500,
  warning: 7000,
  error: 0,
};

/** More than this on screen and the newest ones push the oldest off the top of the stack. */
export const MAX_VISIBLE = 4;

export type ToastState = { toasts: Toast[]; nextId: number };

export function emptyState(): ToastState {
  return { toasts: [], nextId: 1 };
}

/**
 * Adds a toast, or bumps the identical one already showing.
 *
 * Marking twenty messages read fires twenty identical toasts, and twenty stacked copies of
 * «Mensaje actualizado» is noise that hides everything else. Collapsing only applies to the
 * most recent one: two separate saves a minute apart should read as two events.
 */
export function addToast(state: ToastState, input: ToastInput): { state: ToastState; toast: Toast } {
  const last = state.toasts[state.toasts.length - 1];

  if (last && last.kind === input.kind && last.message === input.message && !input.action) {
    const bumped: Toast = { ...last, count: last.count + 1 };
    return {
      state: { ...state, toasts: [...state.toasts.slice(0, -1), bumped] },
      toast: bumped,
    };
  }

  const toast: Toast = {
    id: state.nextId,
    kind: input.kind,
    message: input.message,
    duration: input.duration ?? DEFAULT_DURATIONS[input.kind],
    ...(input.action ? { action: input.action } : {}),
    count: 1,
  };

  // The oldest goes, not the newest: what just happened is what the person is waiting to see.
  const toasts = [...state.toasts, toast].slice(-MAX_VISIBLE);

  return { state: { toasts, nextId: state.nextId + 1 }, toast };
}

export function removeToast(state: ToastState, id: number): ToastState {
  return { ...state, toasts: state.toasts.filter((toast) => toast.id !== id) };
}

/** Dropped when a stack of them has piled up and the person wants them gone. */
export function clearToasts(state: ToastState): ToastState {
  return { ...state, toasts: [] };
}

/**
 * Which live region the toast belongs in.
 *
 * `assertive` interrupts what a screen reader is saying, which is right for a failure and
 * rude for a confirmation — announcing «Guardado» over the top of whatever someone is reading
 * is worse than announcing it a moment later.
 */
export function politeness(kind: ToastKind): "polite" | "assertive" {
  return kind === "error" ? "assertive" : "polite";
}

export function roleFor(kind: ToastKind): "alert" | "status" {
  return kind === "error" ? "alert" : "status";
}

/** What a person reads. A repeated message says so rather than appearing several times. */
export function displayMessage(toast: Toast): string {
  return toast.count > 1 ? `${toast.message} (×${toast.count})` : toast.message;
}

/**
 * Turns whatever a caller has into a message.
 *
 * Called with an Astro action error, a thrown Error, a string, or something unexpected — and a
 * toast that says «[object Object]» is worse than no toast, because it looks like the system
 * knows something it will not say.
 */
export function messageFrom(error: unknown, fallback = "Algo ha fallado."): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown };
    if (typeof candidate.message === "string" && candidate.message.trim()) {
      return candidate.message.trim();
    }
  }
  return fallback;
}
