/**
 * PUBLISH — job one of two. (D4)
 *
 * This function does the whole snapshot in a single transaction and returns.
 * It does not render anything, touch the filesystem, or wait for a build. It
 * cannot meaningfully fail: it is a handful of inserts against data already in
 * the database.
 *
 * What it produces is a complete, self-sufficient description of a site at an
 * instant: which revision of every page, which theme revision, and which live
 * records those pages point at. A worker can turn that into an artifact now, in
 * an hour, or after a crash and three retries — the input never changes, which
 * is exactly why artifacts can be immutable. (D7)
 *
 * Publish is site-wide, not per-page (D4). A "version" where page A is new and
 * page B is old is not a version of anything anyone can reason about.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { expandCollectionRefs, extractRefsFromBody, mergeRefs, type Ref } from "./refs";
import type { PageBody } from "./registry/types";

export interface PublishResult {
  releaseId: string;
  versionNo: number;
  jobId: string;
  pageCount: number;
  dependencyCount: number;
}

const EMPTY_BODY: PageBody = { version: 1, root: [] };

export async function publishSite(
  siteId: string,
  userId: string | null,
  notes?: string,
): Promise<PublishResult> {
  return prisma.$transaction(
    async (tx) => {
      // ── 1. Everything this release will pin ────────────────────────────────
      const pages = await tx.page.findMany({
        where: { siteId, deletedAt: null },
        include: { draft: true },
        orderBy: { path: "asc" },
      });
      if (pages.length === 0) throw new Error("Site has no pages to publish");

      // Current max version_no per page, in one round trip.
      const maxima = await tx.pageRevision.groupBy({
        by: ["pageId"],
        where: { pageId: { in: pages.map((p) => p.id) } },
        _max: { versionNo: true },
      });
      const maxByPage = new Map(maxima.map((m) => [m.pageId, m._max.versionNo ?? 0]));

      // ── 2. Promote drafts → revisions. APPEND ONLY. ────────────────────────
      // The draft row is left exactly where it is: it keeps being the working
      // copy. Nothing is updated, nothing is deleted, version_no only ever
      // climbs. Every arrangement this site has ever published stays readable.
      const bodies: PageBody[] = [];
      const revisionIdByPage = new Map<string, string>();

      for (const page of pages) {
        const body = ((page.draft?.body as unknown) ?? EMPTY_BODY) as PageBody;
        bodies.push(body);
        const revision = await tx.pageRevision.create({
          data: {
            pageId: page.id,
            body: body as unknown as Prisma.InputJsonValue,
            versionNo: (maxByPage.get(page.id) ?? 0) + 1,
            createdBy: userId,
          },
          select: { id: true },
        });
        revisionIdByPage.set(page.id, revision.id);
      }

      // ── 3. Pin the theme ───────────────────────────────────────────────────
      const theme = await tx.theme.findFirst({ where: { siteId } });
      let themeRevisionId: string | null = theme?.currentRevisionId ?? null;
      if (theme && !themeRevisionId) {
        const latest = await tx.themeRevision.findFirst({
          where: { themeId: theme.id },
          orderBy: { versionNo: "desc" },
          select: { id: true },
        });
        themeRevisionId = latest?.id ?? null;
      }

      // ── 4. The release ─────────────────────────────────────────────────────
      const lastRelease = await tx.release.findFirst({
        where: { siteId },
        orderBy: { versionNo: "desc" },
        select: { versionNo: true },
      });
      const release = await tx.release.create({
        data: {
          siteId,
          versionNo: (lastRelease?.versionNo ?? 0) + 1,
          status: "building",
          artifactType: "static",
          notes: notes?.trim() || null,
          createdBy: userId,
        },
      });

      // ── 5. THE MANIFEST ────────────────────────────────────────────────────
      // Exactly which revision of which entity this release consists of. The
      // build is a pure function of these rows, so it never needs redoing.
      await tx.releaseItem.createMany({
        data: [
          ...pages.map((p) => ({
            releaseId: release.id,
            entityType: "page" as const,
            entityId: p.id,
            revisionId: revisionIdByPage.get(p.id)!,
          })),
          ...(theme && themeRevisionId
            ? [
                {
                  releaseId: release.id,
                  entityType: "theme" as const,
                  entityId: theme.id,
                  revisionId: themeRevisionId,
                },
              ]
            : []),
        ],
      });

      // ── 6. Dependencies on LIVE data ───────────────────────────────────────
      // Walk each body against the component prop schemas. A prop is a
      // reference because its schema declares it, not because we pattern-matched
      // a UUID. Collections fan out to their products, since those products'
      // titles and prices get frozen into the artifact.
      const direct: Ref[] = mergeRefs(bodies.map(extractRefsFromBody));
      const collectionIds = direct.filter((r) => r.refType === "collection").map((r) => r.refId);

      let refs = direct;
      if (collectionIds.length) {
        const links = await tx.collectionProduct.findMany({
          where: { collectionId: { in: collectionIds } },
          select: { collectionId: true, productId: true },
          orderBy: { position: "asc" },
        });
        const byCollection: Record<string, string[]> = {};
        for (const l of links) (byCollection[l.collectionId] ??= []).push(l.productId);
        refs = expandCollectionRefs(direct, byCollection);
      }

      if (refs.length) {
        await tx.releaseDependency.createMany({
          data: refs.map((r) => ({ releaseId: release.id, refType: r.refType, refId: r.refId })),
          skipDuplicates: true,
        });
      }

      // ── 7. Enqueue. Someone else's problem now. ────────────────────────────
      const job = await tx.buildJob.create({
        data: { releaseId: release.id, status: "queued" },
        select: { id: true },
      });

      return {
        releaseId: release.id,
        versionNo: release.versionNo,
        jobId: job.id,
        pageCount: pages.length,
        dependencyCount: refs.length,
      };
    },
    { timeout: 15_000 },
  );
  // NOTE: sites.live_release_id is deliberately NOT touched here. A release
  // becomes live only once an artifact exists on disk. If the build never
  // succeeds, visitors keep getting the previous release, forever if need be.
}
