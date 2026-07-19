/**
 * The live DB inspector behind the walkthrough page.
 *
 * The single most convincing thing in this demo is watching page_revisions
 * climb while page_drafts stays pinned at one row per page. This endpoint
 * exists so you can watch it happen in real time instead of being told it does.
 */
import { NextResponse } from "next/server";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { artifactsRoot } from "@/lib/paths";

export const dynamic = "force-dynamic";

async function listArtifacts(siteId: string) {
  const root = path.join(artifactsRoot(), siteId);
  try {
    const releases = await readdir(root, { withFileTypes: true });
    const out = [];
    for (const entry of releases) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      const files: { name: string; bytes: number; mtime: string }[] = [];
      const walk = async (d: string, prefix = "") => {
        for (const f of await readdir(d, { withFileTypes: true })) {
          const full = path.join(d, f.name);
          if (f.isDirectory()) await walk(full, `${prefix}${f.name}/`);
          else {
            const info = await stat(full);
            files.push({
              name: `${prefix}${f.name}`,
              bytes: info.size,
              mtime: info.mtime.toISOString(),
            });
          }
        }
      };
      await walk(dir);
      out.push({ releaseId: entry.name, files: files.sort((a, b) => a.name.localeCompare(b.name)) });
    }
    return out;
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const siteId = new URL(req.url).searchParams.get("siteId");

  const site = siteId
    ? await prisma.site.findUnique({ where: { id: siteId } })
    : await prisma.site.findFirst({ orderBy: { createdAt: "asc" } });
  if (!site) return NextResponse.json({ error: "No site" }, { status: 404 });

  const pages = await prisma.page.findMany({
    where: { siteId: site.id, deletedAt: null },
    include: { draft: true, _count: { select: { revisions: true } } },
    orderBy: { path: "asc" },
  });

  const [revisions, releases, counts, artifacts] = await Promise.all([
    prisma.pageRevision.findMany({
      where: { page: { siteId: site.id } },
      include: { page: { select: { path: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.release.findMany({
      where: { siteId: site.id },
      orderBy: { versionNo: "desc" },
      take: 10,
      include: { _count: { select: { items: true, dependencies: true } } },
    }),
    Promise.all([
      prisma.pageDraft.count({ where: { page: { siteId: site.id } } }),
      prisma.pageRevision.count({ where: { page: { siteId: site.id } } }),
      prisma.release.count({ where: { siteId: site.id } }),
      prisma.releaseItem.count({ where: { release: { siteId: site.id } } }),
      prisma.releaseDependency.count({ where: { release: { siteId: site.id } } }),
      prisma.buildJob.count({ where: { release: { siteId: site.id } } }),
      prisma.product.count({ where: { siteId: site.id, deletedAt: null } }),
      prisma.order.count({ where: { siteId: site.id } }),
    ]),
    listArtifacts(site.id),
  ]);

  const [drafts, revs, rels, items, deps, jobs, products, orders] = counts;

  return NextResponse.json({
    site: {
      id: site.id,
      name: site.name,
      slug: site.slug,
      customDomain: site.customDomain,
      liveReleaseId: site.liveReleaseId,
    },
    counts: {
      // The two numbers the whole argument rests on.
      page_drafts: drafts,
      page_revisions: revs,
      pages: pages.length,
      releases: rels,
      release_items: items,
      release_dependencies: deps,
      build_jobs: jobs,
      products,
      orders,
    },
    pages: pages.map((p) => ({
      id: p.id,
      path: p.path,
      title: p.title,
      revisionCount: p._count.revisions,
      draft: p.draft
        ? {
            lockVersion: p.draft.lockVersion,
            updatedAt: p.draft.updatedAt,
            bytes: JSON.stringify(p.draft.body).length,
          }
        : null,
    })),
    recentRevisions: revisions.map((r) => ({
      id: r.id,
      path: r.page.path,
      versionNo: r.versionNo,
      createdAt: r.createdAt,
      bytes: JSON.stringify(r.body).length,
    })),
    releases: releases.map((r) => ({
      id: r.id,
      versionNo: r.versionNo,
      status: r.status,
      isLive: r.id === site.liveReleaseId,
      itemCount: r._count.items,
      dependencyCount: r._count.dependencies,
      createdAt: r.createdAt,
    })),
    artifacts,
  });
}
