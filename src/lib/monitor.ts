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
 * monitoring is worse than none.
 */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // The console line is unconditional — it is the baseline that always existed.
  console.error("[monitor]", message, context ?? "");

  const url = process.env.MONITOR_WEBHOOK;
  if (!url) return;

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
    }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {
    /* deliberately swallowed — already logged above */
  });
}
