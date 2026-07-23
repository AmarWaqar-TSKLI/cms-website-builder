/**
 * Non-negotiables #2 (append-only), #4 (whole tree per revision),
 * #5 (publish returns before the build finishes).
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/db";
import { publishSite } from "../../src/lib/publish";
import { APP_URL, createTestSite, node, requireApp, setDraft } from "../helpers/factory";

describe("publish is a snapshot, and only a snapshot", () => {
  it("appends exactly one revision per page, with version_no incrementing", async () => {
    const site = await createTestSite("publish");

    const first = await publishSite(site.siteId, site.userId, "v1");
    expect(first.versionNo).toBe(1);

    let homeRevisions = await prisma.pageRevision.findMany({
      where: { pageId: site.homePageId },
      orderBy: { versionNo: "asc" },
    });
    expect(homeRevisions).toHaveLength(1);
    expect(homeRevisions[0].versionNo).toBe(1);

    // Publish again after editing.
    await setDraft(site.homePageId, [node("Hero", { headline: "Version two" })]);
    const second = await publishSite(site.siteId, site.userId, "v2");
    expect(second.versionNo).toBe(2);

    homeRevisions = await prisma.pageRevision.findMany({
      where: { pageId: site.homePageId },
      orderBy: { versionNo: "asc" },
    });
    expect(homeRevisions).toHaveLength(2);
    expect(homeRevisions.map((r) => r.versionNo)).toEqual([1, 2]);

    // Every page got exactly one new revision — publish is site-wide.
    const aboutRevisions = await prisma.pageRevision.count({ where: { pageId: site.aboutPageId } });
    expect(aboutRevisions).toBe(2);

    // v1's body is still exactly what it was. History was not rewritten.
    const v1Body = homeRevisions[0].body as { root: { props: Record<string, string> }[] };
    expect(v1Body.root[0].props.headline).toBe("Version one");
  });

  it("stores the WHOLE tree in one revision, not per-component rows", async () => {
    const site = await createTestSite("wholetree");
    await setDraft(site.homePageId, [
      node("Hero", { headline: "A" }),
      node("TextBlock", { heading: "B" }),
      node("Spacer", { height: 32 }),
      node("Button", { label: "C" }),
    ]);

    await publishSite(site.siteId, site.userId);

    const revision = await prisma.pageRevision.findFirstOrThrow({
      where: { pageId: site.homePageId },
    });
    const body = revision.body as { root: { type: string }[] };

    // The arrangement — order included — is the information being preserved.
    expect(body.root.map((n) => n.type)).toEqual(["Hero", "TextBlock", "Spacer", "Button"]);
  });

  it("refuses to rewrite history: page_revisions is append-only in the database", async () => {
    const site = await createTestSite("appendonly");
    await publishSite(site.siteId, site.userId);
    const revision = await prisma.pageRevision.findFirstOrThrow({
      where: { pageId: site.homePageId },
    });

    // Not a convention the app follows — a trigger the database enforces.
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE page_revisions SET version_no = 99 WHERE id = '${revision.id}'`,
      ),
    ).rejects.toThrow(/append-only/i);

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM page_revisions WHERE id = '${revision.id}'`),
    ).rejects.toThrow(/append-only/i);
  });

  it("writes the manifest and the dependency edges", async () => {
    const site = await createTestSite("manifest");
    const result = await publishSite(site.siteId, site.userId);

    const items = await prisma.releaseItem.findMany({ where: { releaseId: result.releaseId } });
    // Two pages plus the theme.
    expect(items.filter((i) => i.entityType === "page")).toHaveLength(2);
    expect(items.filter((i) => i.entityType === "theme")).toHaveLength(1);

    const deps = await prisma.releaseDependency.findMany({
      where: { releaseId: result.releaseId },
    });
    // 1 media (Hero background) + 1 collection + its 3 products.
    expect(deps.filter((d) => d.refType === "media")).toHaveLength(1);
    expect(deps.filter((d) => d.refType === "collection")).toHaveLength(1);
    expect(deps.filter((d) => d.refType === "product")).toHaveLength(3);
  });

  it("returns in under 200ms with the job still queued and nothing live", async () => {
    await requireApp();

    // Warm the route. In dev, Next compiles a route on its first request, and
    // measuring that would be measuring the bundler rather than the transaction.
    const warmup = await createTestSite("warmup");
    // The warm-up site belongs to its OWN org, so it needs its own session.
    // Reusing the other site's cookie would 403 — which is the boundary working.
    await fetch(`${APP_URL}/api/sites/${warmup.siteId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: warmup.cookie },
      body: JSON.stringify({ notes: "warmup" }),
    });

    const site = await createTestSite("fast");

    const started = Date.now();
    const res = await fetch(`${APP_URL}/api/sites/${site.siteId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: site.cookie },
      body: JSON.stringify({ notes: "speed test" }),
    });
    const elapsed = Date.now() - started;
    const data = await res.json();

    expect(res.status).toBe(200);
    // The transaction itself, as measured server-side.
    expect(data.elapsedMs).toBeLessThan(200);
    // Round-trip including HTTP, generously bounded.
    expect(elapsed).toBeLessThan(2000);

    // At the instant publish answered, no build had run.
    expect(["queued", "running"]).toContain(data.jobStatusAtReturn);

    const release = await prisma.release.findUniqueOrThrow({ where: { id: data.releaseId } });
    expect(release.status).toBe("building");

    // Crucially: the site is NOT pointing at this release. There is no artifact.
    const siteRow = await prisma.site.findUniqueOrThrow({ where: { id: site.siteId } });
    expect(siteRow.liveReleaseId).not.toBe(data.releaseId);
  });

  it("queues a job rather than building inline", async () => {
    const site = await createTestSite("queue");
    const result = await publishSite(site.siteId, site.userId);

    const job = await prisma.buildJob.findFirstOrThrow({ where: { releaseId: result.releaseId } });
    expect(job.status).toBe("queued");
    expect(job.startedAt).toBeNull();
    expect(job.attempts).toBe(0);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
