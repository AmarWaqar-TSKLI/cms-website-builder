/**
 * THE ROLLBACK PROOF — non-negotiables #6, #7, #9.
 *
 * Publish v1 and capture what the live URL serves. Publish v2 and assert it
 * changed. Roll back, and assert:
 *   1. the served bytes are IDENTICAL to v1's — not similar, identical
 *   2. they match the v1 artifact still sitting on disk
 *   3. NOT ONE FILE was created or modified anywhere under artifacts/
 *
 * (3) is what separates a pointer swap from a rebuild. If rollback re-rendered
 * anything, mtimes would move.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/lib/db";
import { publishSite } from "../../src/lib/publish";
import { artifactsRoot, releaseDir } from "../../src/lib/paths";
import { APP_URL, createTestSite, node, requireApp, setDraft } from "../helpers/factory";
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

      const servedV1 = await (await fetch(`${APP_URL}/s/${site.slug}`)).text();
      expect(servedV1).toContain("THIS IS VERSION ONE");
      const hashV1 = sha(servedV1);

      // The artifact for v1, straight off the disk.
      const diskV1 = await readFile(
        path.join(releaseDir(site.siteId, v1.releaseId), "index.html"),
        "utf8",
      );
      // What the server returned IS the file. No transformation at request time.
      expect(sha(diskV1)).toBe(hashV1);

      // ── v2 ────────────────────────────────────────────────────────────────
      await setDraft(site.homePageId, [
        node("Hero", { headline: "THIS IS VERSION TWO" }),
        node("TextBlock", { heading: "Two", body: "A completely different arrangement." }),
      ]);
      const v2 = await publishSite(site.siteId, site.userId, "v2");
      expect((await waitForRelease(v2.releaseId)).status).toBe("ready");

      const servedV2 = await (await fetch(`${APP_URL}/s/${site.slug}`)).text();
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
      const servedAfter = await (await fetch(`${APP_URL}/s/${site.slug}`)).text();
      expect(sha(servedAfter)).toBe(hashV1);
      expect(servedAfter).toBe(servedV1);

      // ── 2. And identical to v1's artifact on disk ─────────────────────────
      expect(servedAfter).toBe(diskV1);

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
      expect(await (await fetch(`${APP_URL}/s/${site.slug}`)).text()).toBe(servedV2);
    } finally {
      await stopWorker(child);
    }
  });

  it("refuses to point the site at a release that has no artifact", async () => {
    await requireApp();
    const site = await createTestSite("norollbackto");

    // Published but never built — there are no files to serve.
    const orphan = await publishSite(site.siteId, site.userId, "never built");

    const res = await fetch(`${APP_URL}/api/sites/${site.siteId}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ releaseId: orphan.releaseId }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/building|failed|artifact/i);
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
