/**
 * ROLLBACK — one column. (D2, non-negotiable #6)
 *
 * No build is queued. No file is written, read, copied or deleted. The artifact
 * for the target release has been sitting on disk since the day it was built,
 * and this handler simply points the site at it again.
 *
 * The whole operation is the single UPDATE below. Everything else in this file
 * is the safety check that tells you what will look wrong afterwards.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkReleaseDependencies } from "@/lib/dependencies";
import { guardSite } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { fireLiveChanged } from "@/lib/publish-webhooks";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  let payload: { releaseId?: string; acknowledgeWarnings?: boolean };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload.releaseId) {
    return NextResponse.json({ error: "releaseId required" }, { status: 400 });
  }

  const release = await prisma.release.findFirst({
    where: { id: payload.releaseId, siteId },
  });
  if (!release) return NextResponse.json({ error: "Release not found for this site" }, { status: 404 });

  // Only a release with an artifact on disk can be served. A failed build has
  // no files, so pointing at it would break the site.
  if (release.status !== "ready") {
    return NextResponse.json(
      { error: `Release v${release.versionNo} is ${release.status} — it has no artifact to serve.` },
      { status: 409 },
    );
  }

  // Pre-flight: the versioned world is about to go back in time, but the live
  // world is not. Anything this release depends on that has since been deleted
  // will render as a degraded placeholder.
  const dependencies = await checkReleaseDependencies(release.id);
  const warnings = dependencies.filter((d) => d.status !== "ok");

  if (warnings.length > 0 && !payload.acknowledgeWarnings) {
    return NextResponse.json(
      {
        ok: false,
        requiresAcknowledgement: true,
        message: `v${release.versionNo} references ${warnings.length} record(s) that no longer exist. The page will still serve, with placeholders where the data was.`,
        warnings,
      },
      { status: 409 },
    );
  }

  const previousReleaseId = (await prisma.site.findUnique({ where: { id: siteId } }))?.liveReleaseId;

  // ── THE ENTIRE ROLLBACK ──────────────────────────────────────────────────
  await prisma.site.update({
    where: { id: siteId },
    data: { liveReleaseId: release.id },
  });
  // Note what is NOT here: no cache purge, no warming, no rebuild, not even an
  // invalidation message to the app servers. The release being rolled back TO
  // was never evicted — its cache entries are keyed by its own immutable id, so
  // they are still exactly as warm as they were when it was last live. The next
  // request simply reads a different pointer. That is why this is instant no
  // matter how large the site is or how many servers are running.
  // ─────────────────────────────────────────────────────────────────────────

  // Headless consumers get the same signal as on publish — to them a rollback
  // IS a publish: what's live changed, refetch. Fire-and-forget.
  void fireLiveChanged(siteId, release.id, release.versionNo, "rollback").catch(() => {});

  await logActivity({
    siteId,
    userId: auth.user.id,
    actorName: auth.user.name,
    action: "site.rolled_back",
    entityType: "release",
    entityId: release.id,
    summary: `${auth.user.name} rolled the site back to v${release.versionNo}`,
    meta: { from: previousReleaseId, to: release.id, versionNo: release.versionNo },
  });

  return NextResponse.json({
    ok: true,
    liveReleaseId: release.id,
    previousReleaseId,
    versionNo: release.versionNo,
    warnings,
    note: "Single-column update. Nothing was rebuilt and no file was written.",
  });
}
