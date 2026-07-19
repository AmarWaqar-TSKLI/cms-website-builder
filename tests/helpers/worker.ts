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
export function startWorker(extraEnv: Record<string, string> = {}): ChildProcess {
  return spawn("npx", ["tsx", "src/worker/index.ts"], {
    cwd: ROOT,
    shell: process.platform === "win32",
    stdio: "ignore",
    env: { ...process.env, WORKER_POLL_MS: "150", ...extraEnv },
  });
}

export async function stopWorker(child: ChildProcess | null) {
  if (!child) return;
  child.kill();
  await sleep(150);
  if (!child.killed) child.kill("SIGKILL");
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
