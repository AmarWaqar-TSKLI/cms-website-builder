/**
 * Claiming and running build jobs — shared by the two things that drain the
 * `build_jobs` queue:
 *
 *   - the worker (src/worker/index.ts), a separate OS process that polls, and
 *   - the inline runner (src/lib/inline-build.ts), used where no long-lived
 *     process can exist (Vercel). There the request that enqueued the job
 *     drains the queue after its response has been sent.
 *
 * Both go through the same claim (FOR UPDATE SKIP LOCKED) and the same handler,
 * so a job behaves identically whichever one picks it up.
 */
import { prisma } from "./db";
import { buildRelease } from "./build";
import { warmRelease } from "./runtime/warm";
import { fireLiveChanged } from "./publish-webhooks";

export type JobLog = (msg: string) => void;

export interface ClaimedJob {
  id: string;
  release_id: string;
  attempts: number;
}

/**
 * Atomically take the oldest queued job. SKIP LOCKED means a second worker
 * steps over a row that's already being claimed instead of blocking on it.
 */
export async function claimJob(): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE build_jobs
       SET status = 'running',
           started_at = now(),
           attempts = attempts + 1
     WHERE id = (
       SELECT id FROM build_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
    RETURNING id, release_id, attempts
  `;
  return rows[0] ?? null;
}

export async function runJob(job: ClaimedJob, log: JobLog) {
  const started = Date.now();
  log(`claimed job ${short(job.id)} → release ${short(job.release_id)} (attempt ${job.attempts})`);

  try {
    const outcome = await buildRelease(job.release_id);
    await prisma.buildJob.update({
      where: { id: job.id },
      data: { status: "done", finishedAt: new Date(), error: null },
    });
    log(
      `built ${outcome.files.length} files in ${outcome.durationMs}ms → live pointer moved to ${short(job.release_id)}`,
    );

    // ── After-care, outside the job ───────────────────────────────────────
    // Ask the runtime to render each path of the new release once, so the first
    // real visitor is not the one who pays for a cold render.
    //
    // Deliberately AFTER the job is marked done and outside the try that would
    // fail it. The release is already live and correct; a cache that could not
    // be primed is a latency footnote, never a build failure.
    const warm = await warmRelease(outcome.slug, outcome.paths);
    if (warm.warmed.length) log(`warmed ${warm.warmed.length} path(s) on the runtime`);
    if (warm.failed.length) log(`could not warm: ${warm.failed.join(", ")} (harmless)`);

    // Tell headless consumers the live release moved. Best-effort, like warming.
    const hooks = await fireLiveChanged(outcome.siteId, outcome.releaseId, outcome.versionNo, "publish");
    if (hooks.delivered || hooks.failed) {
      log(`publish webhooks: ${hooks.delivered} delivered, ${hooks.failed} failed`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`FAILED job ${short(job.id)} after ${Date.now() - started}ms: ${message}`);

    // The release is marked failed and left non-live. sites.live_release_id is
    // untouched, so the previously built artifact keeps being served with no
    // interruption at all. A retry can be enqueued from the releases screen.
    await prisma.$transaction([
      prisma.buildJob.update({
        where: { id: job.id },
        data: { status: "failed", finishedAt: new Date(), error: message.slice(0, 2000) },
      }),
      prisma.release.update({
        where: { id: job.release_id },
        data: { status: "failed", buildError: message.slice(0, 2000) },
      }),
    ]);
  }
}

/** Claim and run queued jobs until none are left (or `maxJobs` is reached). */
export async function drainBuildJobs(log: JobLog, maxJobs = 10): Promise<number> {
  let ran = 0;
  while (ran < maxJobs) {
    const job = await claimJob();
    if (!job) break;
    await runJob(job, log);
    ran++;
  }
  return ran;
}

function short(id: string) {
  return id.slice(0, 8);
}
