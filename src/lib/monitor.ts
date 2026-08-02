/**
 * Error monitoring — a thin seam so a real deployment can SEE failures, while a
 * demo needs nothing configured.
 *
 * Unconfigured, it does exactly what the code already did: logs to the server
 * console. Configured with MONITOR_WEBHOOK, it ALSO posts a compact JSON payload
 * — a generic webhook, so it fits a Sentry ingestion endpoint, a Slack incoming
 * webhook, or your own collector, without pulling in a client library.
 *
 * It never throws and never blocks: monitoring that can fail the request it is
 * monitoring is worse than none. It also DE-DUPLICATES: a failure that fires a
 * thousand times a minute must not send a thousand webhooks (that's how you get
 * paged into ignoring the pager), so identical errors are collapsed within a
 * short window and the repeat count travels with the next send.
 */
const DEDUPE_MS = 60_000;
const seen = new Map<string, { count: number; firstAt: number }>();

/** Purge stale dedupe entries so the map can't grow without bound. */
function sweep(now: number): void {
  if (seen.size < 256) return;
  for (const [k, v] of seen) if (now - v.firstAt > DEDUPE_MS) seen.delete(k);
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const scope = typeof context?.scope === "string" ? context.scope : "";

  // The console line is unconditional — it is the baseline that always existed.
  console.error("[monitor]", message, context ?? "");

  const url = process.env.MONITOR_WEBHOOK;
  if (!url) return;

  // Collapse a storm of the same error (keyed by message + scope) into one send
  // per window, carrying how many times it recurred.
  const now = Date.now();
  const key = `${scope}::${message}`;
  const prior = seen.get(key);
  if (prior && now - prior.firstAt < DEDUPE_MS) {
    prior.count += 1;
    return;
  }
  const repeatedInWindow = prior?.count ?? 0;
  seen.set(key, { count: 1, firstAt: now });
  sweep(now);

  // Fire and forget. A monitoring outage must not become an application outage.
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      level: "error",
      message,
      stack,
      context: context ?? null,
      service: process.env.MONITOR_SERVICE ?? "cms",
      environment: process.env.NODE_ENV ?? "unknown",
      release: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? null,
      timestamp: new Date(now).toISOString(),
      // >0 when this same error also fired during the previous window.
      repeatedInWindow,
    }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {
    /* deliberately swallowed — already logged above */
  });
}
