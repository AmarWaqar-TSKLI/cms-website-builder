import { NextResponse } from "next/server";
import { guardSite } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Version history. Every row here is a site state that can be returned to. */
export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const releases = await prisma.release.findMany({
    where: { siteId },
    orderBy: { versionNo: "desc" },
    include: {
      _count: { select: { items: true, dependencies: true } },
      buildJobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return NextResponse.json({
    liveReleaseId: site.liveReleaseId,
    releases: releases.map((r) => ({
      id: r.id,
      versionNo: r.versionNo,
      status: r.status,
      notes: r.notes,
      artifactUrl: r.artifactUrl,
      buildError: r.buildError,
      createdAt: r.createdAt,
      itemCount: r._count.items,
      dependencyCount: r._count.dependencies,
      isLive: r.id === site.liveReleaseId,
      job: r.buildJobs[0]
        ? {
            id: r.buildJobs[0].id,
            status: r.buildJobs[0].status,
            attempts: r.buildJobs[0].attempts,
            error: r.buildJobs[0].error,
          }
        : null,
    })),
  });
}
