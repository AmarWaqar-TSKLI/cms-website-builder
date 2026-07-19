import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { prisma } from "../../src/lib/db";
import { sleep } from "./factory";

const ROOT = path.resolve(__dirname, "../..");

/**
 * Boots the REAL worker as a separate OS process — the same command
 * docker-compose runs. Integration tests that claim "a separate process picks
 * the job up" have to actually start one, or they are testing a function call.
 */
/**
 * Spawn node against tsx's CLI directly, NOT `npx tsx` through a shell.
 *
 * With `shell: true` on Windows the pid we hold is cmd.exe, which exits as soon
 * as it has launched npx — leaving the real worker orphaned under a different
 * parent, immune to `taskkill /T`. A test suite that spawns a worker per test
 * then leaks one per test, and those survivors keep polling build_jobs with
 * whatever code they started with. One of them built an artifact full of
 * "Unknown component" long after the registry had gained those components.
 *
 * Spawning node directly means the pid we hold IS the worker.
 */
const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

export function startWorker(extraEnv: Record<string, string> = {}): ChildProcess {
  return spawn(process.execPath, [TSX_CLI, "src/worker/index.ts"], {
    cwd: ROOT,
    stdio: "ignore",
    // POSIX: own process group, so we can signal the whole tree below.
    detached: process.platform !== "win32",
    env: { ...process.env, WORKER_POLL_MS: "150", ...extraEnv },
  });
}

/**
 * Kill the whole process TREE, not just the launcher.
 *
 * `npx tsx …` is a wrapper that spawns the actual node process. Killing the
 * wrapper leaves that child alive, and an orphaned worker keeps polling
 * build_jobs forever — with whatever code it started with. That is not a
 * cosmetic leak: a stale worker will happily claim a job and build an artifact
 * using an old component registry, so pages silently render as
 * "Unknown component". Every test run used to leak one.
 */
export async function stopWorker(child: ChildProcess | null) {
  if (!child?.pid) return;

  if (process.platform === "win32") {
    // The pid is the worker itself now, so a direct kill is enough — and it is
    // more reliable here than `taskkill`, which failed silently in this
    // environment while TerminateProcess (what kill maps to) worked.
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  } else {
    // Signal the whole group, in case tsx spawned anything of its own.
    try {
      process.kill(-child.pid, "SIGTERM");
      await sleep(200);
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }

  // Confirm it is actually gone rather than assuming.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      process.kill(child.pid, 0); // throws once the process no longer exists
    } catch {
      return;
    }
    await sleep(100);
  }
}

/** Poll the release row until it stops being `building`. */
export async function waitForRelease(
  releaseId: string,
  timeoutMs = 45_000,
): Promise<{ status: string; buildError: string | null }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { status: true, buildError: true },
    });
    if (release && release.status !== "building") return release;
    await sleep(200);
  }
  throw new Error(`Release ${releaseId} still building after ${timeoutMs}ms`);
}
