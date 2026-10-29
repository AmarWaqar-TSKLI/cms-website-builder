/**
 * Inline build mode — for hosts with no long-lived process (Vercel).
 *
 * The worker stays the default everywhere it can run. Where it can't, the
 * request that enqueued a build drains the queue itself, AFTER its response has
 * been sent (Next's `after()`). Publish therefore still returns while the job is
 * `queued` and the release is not live: the asynchrony is unchanged, only the
 * process doing the build is different. Jobs are claimed with the same
 * FOR UPDATE SKIP LOCKED query, so an inline drain and a worker can never build
 * the same job twice.
 *
 * On by default when VERCEL is set; INLINE_BUILD=1 / INLINE_BUILD=0 overrides.
 */
import { after } from "next/server";
import { drainBuildJobs } from "./jobs";

export function inlineBuildEnabled(): boolean {
  const flag = process.env.INLINE_BUILD;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return Boolean(process.env.VERCEL);
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [inline-build] ${msg}`);
}

async function drain() {
  try {
    await drainBuildJobs(log);
  } catch (err) {
    log(`drain error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Call after a job has been committed to `build_jobs`. A no-op when a worker
 * owns the queue. Outside a request scope (scripts) it simply runs the drain.
 */
export function scheduleInlineBuild(): void {
  if (!inlineBuildEnabled()) return;
  try {
    after(drain);
  } catch {
    void drain();
  }
}
