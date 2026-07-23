/**
 * The reverse index in use.
 *
 * D5 accepts a specific cost: a frozen page can reference live data that has
 * since been deleted. The deal is that the cost must be VISIBLE. These two
 * functions are what makes it visible:
 *
 *   checkReleaseDependencies — "if I roll back to this release, what will be
 *                               broken on the page?"
 *   releasesReferencing      — "if I delete this product, what breaks?"
 *
 * Both read release_dependencies, which was written at publish time by walking
 * component prop schemas.
 */
import { prisma } from "./db";
import type { RefKind } from "./registry/types";

export interface DependencyStatus {
  refType: RefKind;
  refId: string;
  label: string;
  /** ok = still present; deleted = soft-deleted; gone = row no longer exists. */
  status: "ok" | "deleted" | "gone";
}

export async function checkReleaseDependencies(releaseId: string): Promise<DependencyStatus[]> {
  const deps = await prisma.releaseDependency.findMany({ where: { releaseId } });
  if (deps.length === 0) return [];

  const ids = (t: RefKind) => deps.filter((d) => d.refType === t).map((d) => d.refId);

  const [products, collections, media, posts, components] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: ids("product") } } }),
    prisma.collection.findMany({ where: { id: { in: ids("collection") } } }),
    prisma.media.findMany({ where: { id: { in: ids("media") } } }),
    prisma.post.findMany({ where: { id: { in: ids("post") } } }),
    prisma.sharedComponent.findMany({ where: { id: { in: ids("component") } } }),
  ]);

  return deps.map((dep) => {
    // A shared component is Tier-1: the release pinned an immutable revision, so
    // the built page renders it whatever happened to the symbol afterwards. It is
    // listed here for visibility — "this release uses the Site Header" — and it
    // is always "ok", because deleting a symbol genuinely cannot break a release
    // that already pinned one of its revisions. That is exactly the guarantee a
    // deleted product does NOT come with.
    if (dep.refType === "component") {
      const row = components.find((c) => c.id === dep.refId);
      return {
        refType: dep.refType,
        refId: dep.refId,
        label: row ? row.name : "(component, pinned by revision)",
        status: "ok" as const,
      };
    }

    const row =
      dep.refType === "product"
        ? products.find((p) => p.id === dep.refId)
        : dep.refType === "collection"
          ? collections.find((c) => c.id === dep.refId)
          : dep.refType === "media"
            ? media.find((m) => m.id === dep.refId)
            : posts.find((p) => p.id === dep.refId);

    if (!row) {
      return { refType: dep.refType, refId: dep.refId, label: "(no longer exists)", status: "gone" as const };
    }

    const label =
      "title" in row ? (row as { title: string }).title : `media ${row.id.slice(0, 8)}`;
    const deleted = "deletedAt" in row && (row as { deletedAt: Date | null }).deletedAt !== null;

    return {
      refType: dep.refType,
      refId: dep.refId,
      label,
      status: deleted ? ("deleted" as const) : ("ok" as const),
    };
  });
}

export interface ReferencingRelease {
  releaseId: string;
  versionNo: number;
  status: string;
  isLive: boolean;
  createdAt: Date;
}

/**
 * "What breaks if I delete this?" — the reverse lookup the composite index on
 * (ref_type, ref_id) exists for.
 */
export async function releasesReferencing(
  refType: RefKind,
  refId: string,
): Promise<ReferencingRelease[]> {
  const deps = await prisma.releaseDependency.findMany({
    where: { refType, refId },
    include: { release: { include: { liveForSites: { select: { id: true } } } } },
  });

  return deps
    .map((d) => ({
      releaseId: d.releaseId,
      versionNo: d.release.versionNo,
      status: d.release.status,
      isLive: d.release.liveForSites.length > 0,
      createdAt: d.release.createdAt,
    }))
    .sort((a, b) => b.versionNo - a.versionNo);
}
