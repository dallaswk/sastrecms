/**
 * When a node is visible, and when a write is safe.
 *
 * Three rules that were either missing or wrong, each of which loses something real:
 *
 *  - `scheduled` was already in the status enum and nothing honoured it, so a scheduled node was
 *    invisible for ever.
 *  - `deletedAt` has to be filtered on nine query sites; the conditions live here so there is
 *    one definition rather than nine chances to forget.
 *  - `nodes.update` was last-writer-wins over the whole `fields` object, which with a page of
 *    sections means the loser's entire page is replaced, not merged.
 */

/* --------------------------------------------------------------- visibilidad */

export type VisibilityInput = {
  status: string;
  publishAt?: Date | null;
  deletedAt?: Date | null;
};

/**
 * Whether the public site should serve this node.
 *
 * `scheduled` with a time in the past counts as published: the page appears on the first
 * request after the moment passes, with no cron and no job runner. The cost is that nothing
 * *writes* at that instant, so nothing purges the cache — which is what `cacheTtlFor` below is
 * for.
 */
export function isPubliclyVisible(node: VisibilityInput, now: Date): boolean {
  if (node.deletedAt) return false;
  if (node.status === "published") return true;
  if (node.status === "scheduled" && node.publishAt) return node.publishAt.getTime() <= now.getTime();
  return false;
}

/** In the trash: not visible anywhere, but recoverable. */
export function isTrashed(node: { deletedAt?: Date | null }): boolean {
  return !!node.deletedAt;
}

/**
 * The soonest a scheduled node becomes visible, from now.
 *
 * Used to shorten a cached page's lifetime so it cannot outlive the moment its content changes.
 */
export function nextScheduledAt(nodes: VisibilityInput[], now: Date): Date | null {
  let soonest: Date | null = null;
  for (const node of nodes) {
    if (node.deletedAt || node.status !== "scheduled" || !node.publishAt) continue;
    if (node.publishAt.getTime() <= now.getTime()) continue;
    if (!soonest || node.publishAt.getTime() < soonest.getTime()) soonest = node.publishAt;
  }
  return soonest;
}

/**
 * How long this page may be cached.
 *
 * Scheduled publishing has no write at the moment of publication, so nothing fires a purge — a
 * page cached for an hour would show yesterday's listing for up to an hour after the new post
 * went live. So the TTL is capped at the time remaining until the next scheduled item, with a
 * floor so a schedule two seconds away does not turn caching off entirely.
 */
export function cacheTtlFor(
  defaultMaxAge: number,
  now: Date,
  nextPublish: Date | null,
  floorSeconds = 30
): number {
  if (!nextPublish) return defaultMaxAge;
  const seconds = Math.floor((nextPublish.getTime() - now.getTime()) / 1000);
  if (seconds <= 0) return floorSeconds;
  return Math.max(floorSeconds, Math.min(defaultMaxAge, seconds));
}

/* ------------------------------------------------------- concurrencia */

/**
 * Comparing an `updatedAt` the client sent with the one in the row.
 *
 * The trap is the units. SQLite stores `unixepoch()`, which is **seconds**; a JavaScript Date is
 * **milliseconds**. A naive `a.getTime() === b.getTime()` therefore never matches, and a
 * precondition that never matches is worse than none: every save fails as a conflict and people
 * learn to bypass the check.
 *
 * Compared at second resolution for exactly that reason, and with a small tolerance because a
 * value that has been through JSON and back can land a millisecond either side.
 */
export function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return false;
  return Math.abs(Math.floor(a.getTime() / 1000) - Math.floor(b.getTime() / 1000)) < 1;
}

export type ConflictCheck =
  | { ok: true }
  | { ok: false; reason: string; currentUpdatedAt: Date };

/**
 * The optimistic-concurrency guard.
 *
 * Skipped when the caller sends no expectation, so an agent or a script that does not care is
 * not blocked — but the editor always sends one, because it is the case where two people on the
 * same page silently overwrite each other's entire set of blocks.
 */
export function checkConflict(
  current: { updatedAt: Date; title?: string },
  expected: Date | null | undefined,
  changedBy?: string | null
): ConflictCheck {
  if (!expected) return { ok: true };
  if (sameInstant(current.updatedAt, expected)) return { ok: true };

  const when = current.updatedAt.toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const who = changedBy ? ` por ${changedBy}` : "";

  return {
    ok: false,
    currentUpdatedAt: current.updatedAt,
    reason:
      `Esta página se ha modificado${who} el ${when}, después de que tú la abrieras. ` +
      "Si guardas ahora, perderías ese cambio: recarga para ver la versión actual.",
  };
}

/* ------------------------------------------------------------ programación */

export type ScheduleCheck = { ok: true; publishAt: Date } | { ok: false; reason: string };

/** A schedule in the past is a publish, and pretending otherwise hides the result. */
export function checkSchedule(raw: unknown, now: Date): ScheduleCheck {
  if (typeof raw !== "string" && !(raw instanceof Date)) {
    return { ok: false, reason: "Hace falta una fecha y hora de publicación." };
  }

  const publishAt = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(publishAt.getTime())) {
    return { ok: false, reason: "Esa fecha no es válida." };
  }

  if (publishAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      reason: "Esa fecha ya ha pasado. Si quieres que se vea ahora, publícala directamente.",
    };
  }

  // Two years out is almost always a typo in the year, and a node scheduled for 2126 looks
  // published-but-broken to whoever finds it later.
  const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
  if (publishAt.getTime() - now.getTime() > TWO_YEARS_MS) {
    return { ok: false, reason: "Esa fecha está a más de dos años. Revisa el año." };
  }

  return { ok: true, publishAt };
}

/** How a scheduled node reads in a list. */
export function describeSchedule(publishAt: Date | null | undefined, now: Date): string {
  if (!publishAt) return "";
  const minutes = Math.round((publishAt.getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return "pendiente de la primera visita";
  if (minutes < 60) return `en ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `en ${hours} h`;
  const days = Math.round(hours / 24);
  return `en ${days} día${days === 1 ? "" : "s"}`;
}
