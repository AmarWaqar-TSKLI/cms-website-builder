import { NextResponse } from "next/server";
import { guardRelease } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { checkReleaseDependencies } from "@/lib/dependencies";

export const dynamic = "force-dynamic";

/** Polled by the editor after publish, until status leaves `building`. */
export async function GET(_req: Request, { params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  const auth = await guardRelease(releaseId);
  if (!auth.ok) return auth.response;

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: {
      site: { select: { id: true, slug: true, liveReleaseId: true, customDomain: true } },
      items: true,
      buildJobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dependencies = await checkReleaseDependencies(release.id);

  return NextResponse.json({
    id: release.id,
    versionNo: release.versionNo,
    status: release.status,
    artifactUrl: release.artifactUrl,
    buildError: release.buildError,
    notes: release.notes,
    createdAt: release.createdAt,
    isLive: release.site.liveReleaseId === release.id,
    site: { id: release.site.id, slug: release.site.slug, customDomain: release.site.customDomain },
    items: release.items.map((i) => ({
      entityType: i.entityType,
      entityId: i.entityId,
      revisionId: i.revisionId,
    })),
    dependencies,
    job: release.buildJobs[0]
      ? {
          id: release.buildJobs[0].id,
          status: release.buildJobs[0].status,
          attempts: release.buildJobs[0].attempts,
          error: release.buildJobs[0].error,
          startedAt: release.buildJobs[0].startedAt,
          finishedAt: release.buildJobs[0].finishedAt,
        }
      : null,
  });
}
