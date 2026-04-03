/**
 * Batched product-activity events → ai-backend / Neon (user_activity_events).
 * Requires Clerk + VITE_APP_AI_BACKEND; no-ops when disabled.
 */

export type UserActivityPayload = {
  action: string;
  category?: string;
  metadata?: Record<string, unknown>;
};

const MAX_BATCH = 40;
const FLUSH_MS = 10_000;
const MAX_METADATA_JSON = 12_000;

const queue: UserActivityPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let getToken: (() => Promise<string | null>) | null = null;
let visibilityHooked = false;

function backendBase(): string | null {
  const b =
    typeof import.meta.env.VITE_APP_AI_BACKEND === "string"
      ? import.meta.env.VITE_APP_AI_BACKEND.trim()
      : "";
  return b.length > 0 ? b.replace(/\/$/, "") : null;
}

function ensureVisibilityFlush() {
  if (visibilityHooked || typeof document === "undefined") {
    return;
  }
  visibilityHooked = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushUserActivityNow();
    }
  });
}

/** Call once from the app root when Clerk auth is available. */
export function setUserActivityTokenGetter(
  fn: () => Promise<string | null>,
): void {
  getToken = fn;
  ensureVisibilityFlush();
}

function scheduleFlush() {
  if (flushTimer || !getToken) {
    return;
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushUserActivityNow();
  }, FLUSH_MS);
}

/** Queue an event (signed-in users only; flushed in batches). */
export function logUserActivity(event: UserActivityPayload): void {
  if (!backendBase() || !getToken) {
    return;
  }
  const action = String(event.action || "").slice(0, 200);
  if (!action) {
    return;
  }
  let metadata = event.metadata;
  if (metadata != null) {
    try {
      const s = JSON.stringify(metadata);
      if (s.length > MAX_METADATA_JSON) {
        metadata = { _truncated: true, size: s.length };
      }
    } catch {
      metadata = { _invalid: true };
    }
  }
  queue.push({
    action,
    category: event.category ? String(event.category).slice(0, 100) : undefined,
    metadata,
  });
  if (queue.length >= MAX_BATCH) {
    void flushUserActivityNow();
    return;
  }
  scheduleFlush();
}

/** Best-effort immediate send (e.g. visibility hidden). */
export async function flushUserActivityNow(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const base = backendBase();
  const tokenFn = getToken;
  if (!base || !tokenFn || queue.length === 0) {
    return;
  }
  const batch = queue.splice(0, MAX_BATCH);
  const token = await tokenFn();
  if (!token) {
    return;
  }
  try {
    const res = await fetch(`${base}/v1/activity`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ events: batch }),
    });
    if (!res.ok && batch.length) {
      queue.unshift(...batch);
    }
  } catch {
    queue.unshift(...batch);
  }
  if (queue.length > 500) {
    queue.splice(0, queue.length - 400);
  }
}
