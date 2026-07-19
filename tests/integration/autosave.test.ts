/**
 * Non-negotiable #3: page_drafts is overwrite-only, one row per page.
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/db";
import { APP_URL, createTestSite, node, requireApp, type TestSite } from "../helpers/factory";

let site: TestSite;

describe("autosave overwrites, never accumulates", () => {
  it("leaves page_drafts at exactly one row after 10 autosaves", async () => {
    await requireApp();
    site = await createTestSite("autosave");

    const before = await prisma.pageDraft.count({ where: { pageId: site.homePageId } });
    expect(before).toBe(1);

    const initial = await prisma.pageDraft.findUniqueOrThrow({
      where: { pageId: site.homePageId },
    });
    let lockVersion = initial.lockVersion;

    for (let i = 1; i <= 10; i++) {
      const res = await fetch(`${APP_URL}/api/pages/${site.homePageId}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: { version: 1, root: [node("Hero", { headline: `Autosave ${i}` })] },
          lockVersion,
        }),
      });
      expect(res.status, `autosave ${i} was rejected`).toBe(200);
      lockVersion = (await res.json()).lockVersion;
    }

    // THE ASSERTION: ten writes, one row.
    const after = await prisma.pageDraft.count({ where: { pageId: site.homePageId } });
    expect(after).toBe(1);

    // And across the whole site, still one row per page.
    const siteDrafts = await prisma.pageDraft.count({ where: { page: { siteId: site.siteId } } });
    const sitePages = await prisma.page.count({ where: { siteId: site.siteId, deletedAt: null } });
    expect(siteDrafts).toBe(sitePages);

    // Ten saves advanced the optimistic lock ten times.
    expect(lockVersion).toBe(initial.lockVersion + 10);

    // Autosaving produced NO history. Keystrokes are not versions.
    const revisions = await prisma.pageRevision.count({ where: { pageId: site.homePageId } });
    expect(revisions).toBe(0);

    // The last write is the one that survived.
    const final = await prisma.pageDraft.findUniqueOrThrow({ where: { pageId: site.homePageId } });
    const body = final.body as { root: { props: Record<string, string> }[] };
    expect(body.root[0].props.headline).toBe("Autosave 10");
  });

  it("rejects a stale write with 409 instead of clobbering it", async () => {
    await requireApp();

    const current = await prisma.pageDraft.findUniqueOrThrow({
      where: { pageId: site.homePageId },
    });

    // Simulating a second tab: it holds a lock_version from before the burst.
    const res = await fetch(`${APP_URL}/api/pages/${site.homePageId}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: { version: 1, root: [node("Hero", { headline: "From a stale tab" })] },
        lockVersion: current.lockVersion - 5,
      }),
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("conflict");

    // The good copy is untouched.
    const after = await prisma.pageDraft.findUniqueOrThrow({ where: { pageId: site.homePageId } });
    const body = after.body as { root: { props: Record<string, string> }[] };
    expect(body.root[0].props.headline).toBe("Autosave 10");
    expect(after.lockVersion).toBe(current.lockVersion);
  });

  it("cannot create a second draft row for a page — the PK forbids it", async () => {
    await expect(
      prisma.pageDraft.create({
        data: { pageId: site.homePageId, body: { version: 1, root: [] } as never },
      }),
    ).rejects.toThrow();
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
