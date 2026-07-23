/**
 * THE ROLLBACK PROOF.
 *
 * Publish v1 and capture what the live URL serves. Publish v2 and assert it
 * changed. Roll back, and assert:
 *   1. the served bytes are IDENTICAL to v1's — not similar, identical
 *   2. v1's prerendered copy on disk is untouched
 *   3. NOT ONE FILE was created or modified anywhere under artifacts/
 *   4. no build job was queued
 *
 * (1) is the interesting one now that hosting renders on demand. It holds
 * because the release being rolled back to is immutable, so re-rendering it is a
 * pure function with the same inputs — and because its cache entry is keyed by
 * that release id, it was never evicted when v2 went live. Rollback is not a
 * restore; the old version never went anywhere.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/lib/db";
import { publishSite } from "../../src/lib/publish";
import { artifactsRoot, releaseDir } from "../../src/lib/paths";
import { APP_URL, createTestSite, node, requireApp, setDraft, stableHtml } from "../helpers/factory";
import { startWorker, stopWorker, waitForRelease } from "../helpers/worker";

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/** Every file under artifacts/, with size and mtime — a fingerprint of the tree. */
async function fingerprintArtifacts(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const root = artifactsRoot();

  async function walk(dir: string, prefix = "") {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const key = `${prefix}${e.name}`;
      if (e.isDirectory()) await walk(full, `${key}/`);
      else {
        const info = await stat(full);
        out[key] = `${info.size}:${info.mtimeMs}`;
      }
    }
  }
  await walk(root);
  return out;
}

describe("rollback is a pointer swap", () => {
  it("serves byte-identical v1 HTML after rolling back, having written nothing", async () => {
    await requireApp();
    const site = await createTestSite("rollback");
    const child = startWorker();

    try {
      // ── v1 ────────────────────────────────────────────────────────────────
      await setDraft(site.homePageId, [
        node("Hero", { headline: "THIS IS VERSION ONE" }),
        node("TextBlock", { heading: "One", body: "The first published arrangement." }),
      ]);
      const v1 = await publishSite(site.siteId, site.userId, "v1");
      expect((await waitForRelease(v1.releaseId)).status).toBe("ready");

      const servedV1 = stableHtml(await (await fetch(`${APP_URL}/s/${site.slug}`)).text());
      expect(servedV1).toContain("THIS IS VERSION ONE");
      const hashV1 = sha(servedV1);

      // Rendering the same release twice must produce the same bytes. This is
      // what "immutable" means once hosting renders on demand instead of reading
      // a file, and it is the property the byte-identical rollback below rests on.
      const servedAgain = stableHtml(await (await fetch(`${APP_URL}/s/${site.slug}`)).text());
      expect(sha(servedAgain)).toBe(hashV1);

      // The prerendered copy exists for the export. Hosting does not read it,
      // so it is checked separately rather than compared to the response.
      const diskV1 = await readFile(
        path.join(releaseDir(site.siteId, v1.releaseId), "index.html"),
        "utf8",
      );
      expect(diskV1).toContain("THIS IS VERSION ONE");

      // ── v2 ────────────────────────────────────────────────────────────────
      await setDraft(site.homePageId, [
        node("Hero", { headline: "THIS IS VERSION TWO" }),
        node("TextBlock", { heading: "Two", body: "A completely different arrangement." }),
      ]);
      const v2 = await publishSite(site.siteId, site.userId, "v2");
      expect((await waitForRelease(v2.releaseId)).status).toBe("ready");

      const servedV2 = stableHtml(await (await fetch(`${APP_URL}/s/${site.slug}`)).text());
      expect(servedV2).toContain("THIS IS VERSION TWO");
      expect(servedV2).not.toContain("THIS IS VERSION ONE");
      expect(sha(servedV2)).not.toBe(hashV1);

      // ── Fingerprint the world, then roll back ─────────────────────────────
      const before = await fingerprintArtifacts();

      const res = await fetch(`${APP_URL}/api/sites/${site.siteId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: v1.releaseId, acknowledgeWarnings: true }),
      });
      expect(res.status).toBe(200);

      const after = await fingerprintArtifacts();

      // ── 1. Byte-identical to what v1 served ───────────────────────────────
      const servedAfter = stableHtml(await (await fetch(`${APP_URL}/s/${site.slug}`)).text());
      expect(sha(servedAfter)).toBe(hashV1);
      expect(servedAfter).toBe(servedV1);

      // ── 2. And v1's prerendered copy is still exactly as it was ───────────
      const diskV1After = await readFile(
        path.join(releaseDir(site.siteId, v1.releaseId), "index.html"),
        "utf8",
      );
      expect(diskV1After).toBe(diskV1);

      // ── 3. Nothing was written, created, or touched ───────────────────────
      expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
      for (const [file, stamp] of Object.entries(before)) {
        expect(after[file], `${file} was modified by a rollback`).toBe(stamp);
      }

      // v2's artifact still exists, untouched — rollback destroys nothing.
      const v2Html = await readFile(
        path.join(releaseDir(site.siteId, v2.releaseId), "index.html"),
        "utf8",
      );
      expect(v2Html).toContain("THIS IS VERSION TWO");

      // No new build was queued.
      const jobs = await prisma.buildJob.count({
        where: { release: { siteId: site.siteId } },
      });
      expect(jobs).toBe(2);

      // ── And forward again, just as cheaply ────────────────────────────────
      await fetch(`${APP_URL}/api/sites/${site.siteId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: v2.releaseId, acknowledgeWarnings: true }),
      });
      expect(stableHtml(await (await fetch(`${APP_URL}/s/${site.slug}`)).text())).toBe(servedV2);
    } finally {
      await stopWorker(child);
    }
  });

  it("refuses to point the site at a release that has no artifact", async () => {
    await requireApp();
    const site = await createTestSite("norollbackto");

    // A release that never finished building. Constructed directly rather than
    // via publishSite(), because publishing enqueues a job and ANY worker alive
    // in the suite would race to build it — the test would then be asserting
    // scheduling luck instead of the guard it is about.
    const orphan = await prisma.release.create({
      data: {
        siteId: site.siteId,
        versionNo: 999,
        status: "failed",
        buildError: "injected: never built",
      },
    });

    const res = await fetch(`${APP_URL}/api/sites/${site.siteId}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ releaseId: orphan.id }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/building|failed|artifact|serve/i);
  });

  it("warns about deleted live data before rolling back to a release that used it", async () => {
    await requireApp();
    const site = await createTestSite("depwarn");
    const child = startWorker();

    try {
      const v1 = await publishSite(site.siteId, site.userId, "with products");
      expect((await waitForRelease(v1.releaseId)).status).toBe("ready");

      await setDraft(site.homePageId, [node("Hero", { headline: "no products now" })]);
      const v2 = await publishSite(site.siteId, site.userId, "without products");
      expect((await waitForRelease(v2.releaseId)).status).toBe("ready");

      // Soft-delete something v1 depends on.
      await prisma.product.update({
        where: { id: site.productIds[0] },
        data: { deletedAt: new Date(), status: "archived" },
      });

      // Rolling back to v1 should say so, rather than silently degrading.
      const res = await fetch(`${APP_URL}/api/sites/${site.siteId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: v1.releaseId }),
      });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.requiresAcknowledgement).toBe(true);
      expect(data.warnings.some((w: { status: string }) => w.status === "deleted")).toBe(true);

      // Acknowledged, it proceeds — the cost is accepted, not prevented.
      const forced = await fetch(`${APP_URL}/api/sites/${site.siteId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: v1.releaseId, acknowledgeWarnings: true }),
      });
      expect(forced.status).toBe(200);

      // And the page still serves — degraded, not broken.
      const served = await fetch(`${APP_URL}/s/${site.slug}`);
      expect(served.status).toBe(200);
    } finally {
      await stopWorker(child);
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
