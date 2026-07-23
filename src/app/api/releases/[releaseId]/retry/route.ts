/**
 * Retry a failed build.
 *
 * Note what this does NOT do: recreate the release, re-snapshot the drafts, or
 * change anything about what is being built. The manifest is untouched and
 * immutable, so a retry is literally the same job again — which is the property
 * that lets a build fail without costing anything.
 */
import { NextResponse } from "next/server";
import { guardRelease } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  const auth = await guardRelease(releaseId);
  if (!auth.ok) return auth.response;

  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (release.status === "ready") {
    // Rebuilding a succeeded release would violate artifact immutability (D7).
    return NextResponse.json(
      { error: "This release already built successfully. Artifacts are never rebuilt." },
      { status: 409 },
    );
  }

  const [, job] = await prisma.$transaction([
    prisma.release.update({
      where: { id: releaseId },
      data: { status: "building", buildError: null },
    }),
    prisma.buildJob.create({ data: { releaseId, status: "queued" } }),
  ]);

  return NextResponse.json({ ok: true, jobId: job.id, releaseId });
}
