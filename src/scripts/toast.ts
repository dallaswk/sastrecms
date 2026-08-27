import {
  addToast,
  removeToast,
  clearToasts,
  emptyState,
  displayMessage,
  politeness,
  roleFor,
  messageFrom,
  type ToastInput,
  type ToastKind,
  type ToastState,
} from "@lib/toast";

/**
 * The backoffice's toasts.
 *
 * Vanilla and mounted once by AdminLayout, so it works the same from a Vue island and from a
 * plain `<script>` in an .astro page — the backoffice has both, and a notification system that
 * only one half can reach ends up duplicated.
 *
 * Reachable two ways on purpose: imported (`import { toast } from "@/scripts/toast"`) inside a
 * bundled module, and as `window.sastreToast` for a script that is not bundled with this one.
 */

const CONTAINER_ID = "sastre-toasts";

const STYLE: Record<ToastKind, { box: string; icon: string }> = {
  success: { box: "border-success/40 bg-success/10 text-base-content", icon: "✓" },
  error: { box: "border-error/50 bg-error/10 text-base-content", icon: "✕" },
  warning: { box: "border-warning/40 bg-warning/10 text-base-content", icon: "!" },
  info: { box: "border-base-300 bg-base-200 text-base-content", icon: "i" },
};

const ICON_COLOR: Record<ToastKind, string> = {
  success: "text-success",
  error: "text-error",
  warning: "text-warning",
  info: "text-base-content/50",
};

let state: ToastState = emptyState();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const actions = new Map<number, (id: string) => void>();

function container(): HTMLElement | null {
  return document.getElementById(CONTAINER_ID);
}

function clearTimer(id: number) {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

function dismiss(id: number) {
  clearTimer(id);
  actions.delete(id);
  state = removeToast(state, id);
  render();
}

function render() {
  const root = container();
  if (!root) return;

  root.replaceChildren();

  for (const toast of state.toasts) {
    const style = STYLE[toast.kind];

    const box = document.createElement("div");
    box.className =
      `pointer-events-auto flex items-start gap-3 rounded-lg border px-3 py-2.5 shadow-lg ` +
      `w-80 max-w-[calc(100vw-2rem)] ${style.box}`;
    box.setAttribute("role", roleFor(toast.kind));
    box.setAttribute("aria-live", politeness(toast.kind));

    const icon = document.createElement("span");
    icon.className = `font-bold leading-5 shrink-0 ${ICON_COLOR[toast.kind]}`;
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = style.icon;
    box.appendChild(icon);

    const body = document.createElement("div");
    body.className = "flex flex-col gap-1.5 min-w-0 flex-1";

    const text = document.createElement("p");
    text.className = "text-sm leading-snug break-words";
    // textContent, never innerHTML: these messages carry server text, a field name a visitor
    // typed, or an error body. One of them will contain a tag sooner or later.
    text.textContent = displayMessage(toast);
    body.appendChild(text);

    if (toast.action) {
      const handler = actions.get(toast.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-xs btn-ghost border border-base-300 self-start";
      button.textContent = toast.action.label;
      button.addEventListener("click", () => {
        handler?.(toast.action!.id);
        dismiss(toast.id);
      });
      body.appendChild(button);
    }

    box.appendChild(body);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn btn-xs btn-ghost shrink-0 -mr-1 -mt-0.5";
    close.setAttribute("aria-label", "Cerrar aviso");
    close.textContent = "✕";
    close.addEventListener("click", () => dismiss(toast.id));
    box.appendChild(close);

    // Hovering pauses the countdown: reaching for the close button should not be a race
    // against the toast disappearing on its own.
    if (toast.duration > 0) {
      box.addEventListener("mouseenter", () => clearTimer(toast.id));
      box.addEventListener("mouseleave", () => schedule(toast.id, toast.duration));
    }

    root.appendChild(box);
  }
}

function schedule(id: number, duration: number) {
  if (duration <= 0) return;
  clearTimer(id);
  timers.set(id, setTimeout(() => dismiss(id), duration));
}

function show(input: ToastInput, onAction?: (id: string) => void): number {
  const result = addToast(state, input);
  state = result.state;

  // Timers for toasts that fell off the top are dropped, or they would fire against an id
  // that is no longer on screen.
  for (const id of [...timers.keys()]) {
    if (!state.toasts.some((toast) => toast.id === id)) clearTimer(id);
  }

  if (onAction) actions.set(result.toast.id, onAction);
  render();
  schedule(result.toast.id, result.toast.duration);
  return result.toast.id;
}

export const toast = {
  success: (message: string, options?: Partial<ToastInput>) =>
    show({ kind: "success", message, ...options }),
  error: (message: string, options?: Partial<ToastInput>) =>
    show({ kind: "error", message, ...options }),
  warning: (message: string, options?: Partial<ToastInput>) =>
    show({ kind: "warning", message, ...options }),
  info: (message: string, options?: Partial<ToastInput>) =>
    show({ kind: "info", message, ...options }),

  /** With a button. The callback receives the action id, so one handler can serve several. */
  withAction: (
    input: ToastInput & { action: { label: string; id: string } },
    onAction: (id: string) => void
  ) => show(input, onAction),

  dismiss,
  clear: () => {
    for (const id of timers.keys()) clearTimeout(timers.get(id)!);
    timers.clear();
    actions.clear();
    state = clearToasts(state);
    render();
  },

  /**
   * The common case at a call site: show whatever went wrong without having to work out what
   * shape the failure arrived in.
   */
  fromError: (error: unknown, fallback?: string) =>
    show({ kind: "error", message: messageFrom(error, fallback) }),
};

declare global {
  interface Window {
    sastreToast?: typeof toast;
  }
}

// For scripts that are not bundled with this module — the .astro pages each compile their own
// island, so the import alone would give each of them a separate copy of the state.
if (typeof window !== "undefined") {
  window.sastreToast = window.sastreToast ?? toast;
}
