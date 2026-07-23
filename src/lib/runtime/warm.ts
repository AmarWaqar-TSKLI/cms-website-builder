/**
 * Cache warming — the build job's last act.
 *
 * The worker no longer produces the thing visitors read; the runtime does. What
 * the worker can still usefully do at the end of a build is ask the runtime to
 * render the new release once per path, so that:
 *
 *   1. the first real visitor never pays for a cold render, and
 *   2. every public response for a release is byte-identical.
 *
 * (2) is the non-obvious one. Next renders dynamic routes as a stream, and the
 * first render of a route flushes slightly different framing than subsequent
 * ones — a difference of a few dozen bytes in the RSC payload, not in the page.
 * Absorbing that first render here means the difference is never something a
 * visitor, a CDN, or the rollback proof can observe.
 *
 * Deliberately best-effort. It runs AFTER the pointer swap, so a warm request
 * that fails costs latency and nothing else. A build must never fail because a
 * cache could not be primed.
 */

/** Where the worker can reach the app. Inside compose that is not localhost. */
function appOrigin(): string {
  return (
    process.env.APP_INTERNAL_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_RUNTIME_API ||
    "http://localhost:3000"
  );
}

export interface WarmResult {
  warmed: string[];
  failed: string[];
}

export async function warmRelease(slug: string, paths: string[]): Promise<WarmResult> {
  const origin = appOrigin().replace(/\/+$/, "");
  const warmed: string[] = [];
  const failed: string[] = [];

  for (const rawPath of paths) {
    const suffix = rawPath === "/" ? "" : rawPath.replace(/^\/+/, "");
    const url = `${origin}/s/${slug}${suffix ? `/${suffix}` : ""}`;
    try {
      // Twice on purpose. The first render is the one whose framing differs; the
      // second confirms the route is genuinely warm before anyone else arrives.
      const first = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      await first.text();
      const second = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      await second.text();
      if (second.ok) warmed.push(rawPath);
      else failed.push(rawPath);
    } catch {
      failed.push(rawPath);
    }
  }

  return { warmed, failed };
}
