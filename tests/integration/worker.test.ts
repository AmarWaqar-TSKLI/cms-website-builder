/**
 * The build worker, as a genuinely separate process.
 *
 * Includes the crash-safety proof: a build that fails leaves the release
 * non-live and the previously built artifact still serving.
 *
 * These tests start and stop the REAL worker themselves, which is why
 * `make test` stops the `worker` container first — two competing workers would
 * make "who claimed this job" nondeterministic.
 */
import { afterAll, describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/lib/db";
import { publishSite } from "../../src/lib/publish";
import { releaseDir } from "../../src/lib/paths";
import { createTestSite, node, sleep } from "../helpers/factory";
import { startWorker, stopWorker, waitForRelease } from "../helpers/worker";

describe("build worker", () => {
  it("picks the job off the queue, writes files, and flips the live pointer", async () => {
    const site = await createTestSite("worker");
    const result = await publishSite(site.siteId, site.userId, "built by a real process");

    // Before any worker runs: not live.
    let siteRow = await prisma.site.findUniqueOrThrow({ where: { id: site.siteId } });
    expect(siteRow.liveReleaseId).toBeNull();

    const child = startWorker();
    try {
      const release = await waitForRelease(result.releaseId);
      expect(release.status).toBe("ready");
    } finally {
      await stopWorker(child);
    }

    // The pointer moved only after the artifact existed.
    siteRow = await prisma.site.findUniqueOrThrow({ where: { id: site.siteId } });
    expect(siteRow.liveReleaseId).toBe(result.releaseId);

    // Real files on disk.
    const dir = releaseDir(site.siteId, result.releaseId);
    const files = await readdir(dir);
    expect(files).toContain("index.html");
    expect(files).toContain("cms-manifest.json");

    const html = await readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Version one");
    expect(html).toContain(result.releaseId);

    const job = await prisma.buildJob.findFirstOrThrow({ where: { releaseId: result.releaseId } });
    expect(job.status).toBe("done");
    expect(job.startedAt).not.toBeNull();
  });

  it("leaves the site serving the old artifact when a build fails", async () => {
    const site = await createTestSite("crash");

    // ── A good release first ────────────────────────────────────────────────
    const good = await publishSite(site.siteId, site.userId, "good");
    let child = startWorker();
    try {
      expect((await waitForRelease(good.releaseId)).status).toBe("ready");
    } finally {
      await stopWorker(child);
    }

    const goodDir = releaseDir(site.siteId, good.releaseId);
    const goodHtml = await readFile(path.join(goodDir, "index.html"), "utf8");
    const goodFiles = (await readdir(goodDir)).sort();

    // ── Now a release that CANNOT build ─────────────────────────────────────
    // Not an env flag the test sets: a genuine, data-driven failure. Page "/a"
    // writes a/index.html, while page "/a/index.html" needs a/index.html to be
    // a DIRECTORY. Whichever order the worker renders them in, one write raises.
    await prisma.page.create({ data: { siteId: site.siteId, path: "/a", title: "A" } });
    await prisma.page.create({
      data: { siteId: site.siteId, path: "/a/index.html", title: "Collides" },
    });
    for (const p of await prisma.page.findMany({
      where: { siteId: site.siteId, draft: null, deletedAt: null },
    })) {
      await prisma.pageDraft.create({
        data: { pageId: p.id, body: { version: 1, root: [node("TextBlock", {})] } as never },
      });
    }

    const bad = await publishSite(site.siteId, site.userId, "doomed");
    child = startWorker();
    let badResult: { status: string; buildError: string | null };
    try {
      badResult = await waitForRelease(bad.releaseId);
    } finally {
      await stopWorker(child);
    }

    expect(badResult.status).toBe("failed");
    expect(badResult.buildError).toBeTruthy();

    // THE POINT: the site never moved. Visitors are unaffected by a failed build.
    const siteRow = await prisma.site.findUniqueOrThrow({ where: { id: site.siteId } });
    expect(siteRow.liveReleaseId).toBe(good.releaseId);
    expect(siteRow.liveReleaseId).not.toBe(bad.releaseId);

    // The previously built artifact is untouched, byte for byte.
    expect((await readdir(goodDir)).sort()).toEqual(goodFiles);
    expect(await readFile(path.join(goodDir, "index.html"), "utf8")).toBe(goodHtml);

    // The snapshot survived the build failure — the manifest is all still there,
    // which is exactly why a retry is possible and costs nothing.
    const items = await prisma.releaseItem.count({ where: { releaseId: bad.releaseId } });
    expect(items).toBeGreaterThan(0);

    const job = await prisma.buildJob.findFirstOrThrow({
      where: { releaseId: bad.releaseId },
      orderBy: { createdAt: "desc" },
    });
    expect(job.status).toBe("failed");
    expect(job.error).toBeTruthy();
  });

  it("hands a job to exactly one worker even when several are polling", async () => {
    const site = await createTestSite("skiplocked");
    const result = await publishSite(site.siteId, site.userId);

    // Two workers racing for one job. FOR UPDATE SKIP LOCKED means one wins and
    // the other steps over the row rather than blocking on it.
    const a = startWorker();
    const b = startWorker();
    try {
      await waitForRelease(result.releaseId);
      await sleep(500);
    } finally {
      await stopWorker(a);
      await stopWorker(b);
    }

    const jobs = await prisma.buildJob.findMany({ where: { releaseId: result.releaseId } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("done");
    // Claimed exactly once — not picked up twice.
    expect(jobs[0].attempts).toBe(1);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
