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
import { claimJob, runJob } from "../lib/jobs";

const POLL_MS = Number(process.env.WORKER_POLL_MS || 250);
const WORKER_ID = `worker-${process.pid}`;

let running = true;
let inFlight = false;

async function tick() {
  if (inFlight) return;
  inFlight = true;
  try {
    const job = await claimJob();
    if (job) await runJob(job, log);
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
