/**
 * SHARED COMPONENTS, END TO END.
 *
 * The promise is a single sentence: edit the header once and every page using it
 * changes; roll back and every page gets the old header again. This file proves
 * both halves against a real database, a real build worker and the real files on
 * disk — not against a mock of any of them.
 *
 * The second half is the one worth being careful about. It only works because a
 * release pins a component REVISION rather than a component. If it pinned the
 * component, rolling back would restore the old pages and leave them rendering
 * today's header, and version history would quietly be a lie.
 */
import { afterAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/lib/db";
import { ComponentCycleError, publishSite } from "../../src/lib/publish";
import { releaseDir } from "../../src/lib/paths";
import { createComponentRef } from "../../src/lib/registry";
import { toJson } from "../../src/lib/json";
import { createTestSite, node, setDraft, type TestSite } from "../helpers/factory";
import { startWorker, stopWorker, waitForRelease } from "../helpers/worker";

/** Create a shared component with a body, the way the API route does. */
async function makeComponent(siteId: string, name: string, root: ReturnType<typeof node>[]) {
  return prisma.sharedComponent.create({
    data: {
      siteId,
      name,
      draft: { create: { body: toJson({ version: 1, root }), lockVersion: 1 } },
    },
  });
}

async function setComponentBody(componentId: string, root: ReturnType<typeof node>[]) {
  await prisma.sharedComponentDraft.update({
    where: { componentId },
    data: { body: toJson({ version: 1, root }), lockVersion: { increment: 1 } },
  });
}

/** The two built pages of a release, read straight off disk. */
async function readPages(site: TestSite, releaseId: string) {
  const dir = releaseDir(site.siteId, releaseId);
  return {
    home: await readFile(path.join(dir, "index.html"), "utf8"),
    about: await readFile(path.join(dir, "about", "index.html"), "utf8"),
  };
}

describe("shared components", () => {
  it("edits once and changes every page, then rolls back to the old version", async () => {
    const site = await createTestSite("shared");
    const child = startWorker();

    try {
      const header = await makeComponent(site.siteId, "Site Header", [
        node("Heading", { text: "HEADER MARK ONE" }),
      ]);

      // Both pages reference the SAME definition. Neither holds its content.
      await setDraft(site.homePageId, [
        createComponentRef(header.id, "inst-home"),
        node("Hero", { headline: "Home hero" }),
      ]);
      await setDraft(site.aboutPageId, [
        createComponentRef(header.id, "inst-about"),
        node("TextBlock", { heading: "About", body: "b" }),
      ]);

      // ── Release one ──────────────────────────────────────────────────────
      const r1 = await publishSite(site.siteId, null, "shared v1");
      await waitForRelease(r1.releaseId);

      expect(r1.componentCount).toBe(1);

      const v1 = await readPages(site, r1.releaseId);
      expect(v1.home).toContain("HEADER MARK ONE");
      expect(v1.about).toContain("HEADER MARK ONE");

      // The pages' own revisions contain a REFERENCE, not the header's content.
      const homeRevision = await prisma.pageRevision.findFirstOrThrow({
        where: { pageId: site.homePageId },
        orderBy: { versionNo: "desc" },
      });
      const stored = JSON.stringify(homeRevision.body);
      expect(stored).toContain(header.id);
      expect(stored).not.toContain("HEADER MARK ONE");

      // ── One edit, two pages ──────────────────────────────────────────────
      await setComponentBody(header.id, [node("Heading", { text: "HEADER MARK TWO" })]);

      // Deliberately do NOT touch either page draft.
      const r2 = await publishSite(site.siteId, null, "shared v2");
      await waitForRelease(r2.releaseId);

      const v2 = await readPages(site, r2.releaseId);
      expect(v2.home).toContain("HEADER MARK TWO");
      expect(v2.about).toContain("HEADER MARK TWO");
      expect(v2.home).not.toContain("HEADER MARK ONE");

      // ── The old release is untouched ─────────────────────────────────────
      // Not "regenerates the same output" — the same bytes, still on disk.
      const stillV1 = await readPages(site, r1.releaseId);
      expect(stillV1.home).toBe(v1.home);
      expect(stillV1.about).toBe(v1.about);

      // ── Rollback ─────────────────────────────────────────────────────────
      await prisma.site.update({
        where: { id: site.siteId },
        data: { liveReleaseId: r1.releaseId },
      });
      const rolledBack = await prisma.site.findUniqueOrThrow({ where: { id: site.siteId } });
      expect(rolledBack.liveReleaseId).toBe(r1.releaseId);

      const afterRollback = await readPages(site, r1.releaseId);
      expect(afterRollback.home).toContain("HEADER MARK ONE");
      expect(afterRollback.about).toContain("HEADER MARK ONE");
    } finally {
      stopWorker(child);
    }
  }, 90_000);

  it("pins a revision, so the component's later edits cannot reach an old release", async () => {
    const site = await createTestSite("pinned");
    const child = startWorker();

    try {
      const banner = await makeComponent(site.siteId, "Banner", [
        node("Heading", { text: "ORIGINAL" }),
      ]);
      await setDraft(site.homePageId, [createComponentRef(banner.id, "inst-1")]);

      const r1 = await publishSite(site.siteId, null, "v1");
      await waitForRelease(r1.releaseId);

      const item = await prisma.releaseItem.findFirstOrThrow({
        where: { releaseId: r1.releaseId, entityType: "component", entityId: banner.id },
      });

      // Edit and publish twice more.
      await setComponentBody(banner.id, [node("Heading", { text: "SECOND" })]);
      const r2 = await publishSite(site.siteId, null, "v2");
      await waitForRelease(r2.releaseId);

      await setComponentBody(banner.id, [node("Heading", { text: "THIRD" })]);
      const r3 = await publishSite(site.siteId, null, "v3");
      await waitForRelease(r3.releaseId);

      // Release one still points at the revision it pinned, and that revision
      // still says ORIGINAL. Nothing rewrote it, because nothing can.
      const pinned = await prisma.sharedComponentRevision.findUniqueOrThrow({
        where: { id: item.revisionId },
      });
      expect(JSON.stringify(pinned.body)).toContain("ORIGINAL");

      const revisions = await prisma.sharedComponentRevision.count({
        where: { componentId: banner.id },
      });
      expect(revisions).toBe(3);

      // Each release pinned a different revision.
      const items = await prisma.releaseItem.findMany({
        where: { entityType: "component", entityId: banner.id },
      });
      expect(new Set(items.map((i) => i.revisionId)).size).toBe(3);
    } finally {
      stopWorker(child);
    }
  }, 90_000);

  it("refuses UPDATE and DELETE on component revisions at the database", async () => {
    const site = await createTestSite("append-only");
    const header = await makeComponent(site.siteId, "Header", [node("Heading", { text: "x" })]);
    await setDraft(site.homePageId, [createComponentRef(header.id, "i1")]);
    await publishSite(site.siteId, null, "one");

    const revision = await prisma.sharedComponentRevision.findFirstOrThrow({
      where: { componentId: header.id },
    });

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE shared_component_revisions SET version_no = 99 WHERE id = '${revision.id}'`,
      ),
    ).rejects.toThrow(/append-only/i);

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM shared_component_revisions WHERE id = '${revision.id}'`),
    ).rejects.toThrow(/append-only/i);
  }, 60_000);

  it("records the page→component edge, so 'what uses this?' is answerable", async () => {
    const site = await createTestSite("deps");
    const header = await makeComponent(site.siteId, "Header", [node("Heading", { text: "x" })]);
    await setDraft(site.homePageId, [createComponentRef(header.id, "i1")]);

    const release = await publishSite(site.siteId, null, "deps");

    const dep = await prisma.releaseDependency.findFirst({
      where: { releaseId: release.releaseId, refType: "component", refId: header.id },
    });
    expect(dep).not.toBeNull();
  }, 60_000);

  it("freezes live data referenced only from inside a component", async () => {
    // A ProductGrid living in a shared footer is just as much a dependency as
    // one placed directly on a page. Missing this would render "(deleted
    // product)" for products that are perfectly present.
    const site = await createTestSite("nested-refs");
    const child = startWorker();

    try {
      const footer = await makeComponent(site.siteId, "Footer", [
        node("ProductGrid", { collection: site.collectionId, heading: "From the footer" }),
      ]);
      await setDraft(site.homePageId, [createComponentRef(footer.id, "i1")]);

      const release = await publishSite(site.siteId, null, "nested");
      await waitForRelease(release.releaseId);

      const deps = await prisma.releaseDependency.findMany({
        where: { releaseId: release.releaseId },
      });
      expect(deps.some((d) => d.refType === "collection" && d.refId === site.collectionId)).toBe(
        true,
      );
      // The collection fanned out to its products, from inside the component.
      expect(deps.some((d) => d.refType === "product" && site.productIds.includes(d.refId))).toBe(
        true,
      );

      const dir = releaseDir(site.siteId, release.releaseId);
      const html = await readFile(path.join(dir, "index.html"), "utf8");
      expect(html).toContain("Product 1");
      expect(html).not.toContain("(deleted product)");
    } finally {
      stopWorker(child);
    }
  }, 90_000);

  it("refuses to publish a component that contains itself, writing nothing", async () => {
    const site = await createTestSite("cycle");
    const loop = await makeComponent(site.siteId, "Loop", []);
    await setComponentBody(loop.id, [createComponentRef(loop.id, "self")]);
    await setDraft(site.homePageId, [createComponentRef(loop.id, "i1")]);

    const releasesBefore = await prisma.release.count({ where: { siteId: site.siteId } });
    const revisionsBefore = await prisma.sharedComponentRevision.count({
      where: { componentId: loop.id },
    });

    await expect(publishSite(site.siteId, null, "loop")).rejects.toThrow(ComponentCycleError);

    // The check runs before the first insert, so the transaction leaves no trace.
    expect(await prisma.release.count({ where: { siteId: site.siteId } })).toBe(releasesBefore);
    expect(
      await prisma.sharedComponentRevision.count({ where: { componentId: loop.id } }),
    ).toBe(revisionsBefore);
  }, 60_000);

  it("catches an indirect loop across three components", async () => {
    const site = await createTestSite("cycle3");
    const a = await makeComponent(site.siteId, "A", []);
    const b = await makeComponent(site.siteId, "B", []);
    const c = await makeComponent(site.siteId, "C", []);

    await setComponentBody(a.id, [createComponentRef(b.id, "n1")]);
    await setComponentBody(b.id, [createComponentRef(c.id, "n2")]);
    await setComponentBody(c.id, [createComponentRef(a.id, "n3")]);
    await setDraft(site.homePageId, [createComponentRef(a.id, "i1")]);

    await expect(publishSite(site.siteId, null, "loop3")).rejects.toThrow(/loop/i);
  }, 60_000);

  it("keeps rendering a published component after the component is deleted", async () => {
    // Tier-1 vs Tier-2, made concrete. A deleted PRODUCT degrades a built page,
    // because the artifact only ever held a snapshot of live data. A deleted
    // COMPONENT does not, because the release pinned an immutable revision.
    const site = await createTestSite("deleted-component");
    const child = startWorker();

    try {
      const header = await makeComponent(site.siteId, "Doomed", [
        node("Heading", { text: "STILL HERE" }),
      ]);
      await setDraft(site.homePageId, [createComponentRef(header.id, "i1")]);

      const release = await publishSite(site.siteId, null, "before delete");
      await waitForRelease(release.releaseId);

      await prisma.sharedComponent.update({
        where: { id: header.id },
        data: { deletedAt: new Date() },
      });

      // Rebuild the same release from its manifest — the output must be the same.
      const { buildRelease } = await import("../../src/lib/build");
      await prisma.release.update({
        where: { id: release.releaseId },
        data: { status: "building" },
      });
      await buildRelease(release.releaseId);

      const html = await readFile(
        path.join(releaseDir(site.siteId, release.releaseId), "index.html"),
        "utf8",
      );
      expect(html).toContain("STILL HERE");
    } finally {
      stopWorker(child);
    }
  }, 90_000);
});

afterAll(async () => {
  await prisma.$disconnect();
});
