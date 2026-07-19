/**
 * THE BUILD WORKER — a separate OS process. (D4)
 *
 * It shares no memory with the web app. It finds work by polling the
 * `build_jobs` table and claims a row with FOR UPDATE SKIP LOCKED, so running
 * several workers is safe and no job is ever handed out twice.
 *
 * Why this is a real process rather than a setTimeout inside the API route:
 *   - "publish returns before the build finishes" becomes a property of the
 *     system rather than a trick of measurement.
 *   - You can `docker compose kill worker` mid-build. The release stays
 *     non-live, the previous artifact keeps serving, and the queued row is
 *     still sitting there when the worker comes back.
 *
 * Run it: `npm run worker` (or the `worker` service in docker-compose).
 */
import { loadEnv } from "../lib/env";
loadEnv();

import { prisma } from "../lib/db";
import { buildRelease } from "../lib/build";

const POLL_MS = Number(process.env.WORKER_POLL_MS || 250);
const WORKER_ID = `worker-${process.pid}`;

let running = true;
let inFlight = false;

interface ClaimedJob {
  id: string;
  release_id: string;
  attempts: number;
}

/**
 * Atomically take the oldest queued job. SKIP LOCKED means a second worker
 * steps over a row that's already being claimed instead of blocking on it.
 */
async function claimJob(): Promise<ClaimedJob | null> {
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

async function handle(job: ClaimedJob) {
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

async function tick() {
  if (inFlight) return;
  inFlight = true;
  try {
    const job = await claimJob();
    if (job) await handle(job);
  } catch (err) {
    // Never let a transient DB error kill the worker.
    log(`poll error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    inFlight = false;
  }
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [${WORKER_ID}] ${msg}`);
}
function short(id: string) {
  return id.slice(0, 8);
}

async function main() {
  log(`polling build_jobs every ${POLL_MS}ms`);

  const shutdown = async (signal: string) => {
    log(`${signal} — draining`);
    running = false;
    // Let an in-flight build finish; a half-written artifact directory would
    // still be safe (the release never goes live) but finishing is tidier.
    const deadline = Date.now() + 15_000;
    while (inFlight && Date.now() < deadline) await sleep(100);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  while (running) {
    await tick();
    await sleep(POLL_MS);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
