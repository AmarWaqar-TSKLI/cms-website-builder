/**
 * POST /api/sites/:id/publish
 *
 * Returns as soon as the snapshot transaction commits — typically well under
 * 100ms — with the release still `building` and the job still `queued`. The
 * response deliberately reports how long the snapshot took and what the job
 * status was at that instant, so the asynchrony is observable from the client
 * rather than something you have to take on faith.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishSite } from "@/lib/publish";
import { guardSite } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  let notes: string | undefined;
  try {
    const json = await req.json();
    notes = typeof json?.notes === "string" ? json.notes : undefined;
  } catch {
    /* body is optional */
  }

  const started = Date.now();
  try {
    const result = await publishSite(siteId, userId, notes);
    const elapsedMs = Date.now() - started;

    // Proof, in the response itself, that we are handing back a promise rather
    // than a finished site.
    const job = await prisma.buildJob.findUnique({
      where: { id: result.jobId },
      select: { status: true },
    });

    await logActivity({
      siteId,
      userId,
      actorName: auth.user.name,
      action: "site.published",
      entityType: "release",
      entityId: result.releaseId,
      summary: `${auth.user.name} published v${result.versionNo}`,
      meta: {
        versionNo: result.versionNo,
        pages: result.pageCount,
        components: result.componentCount,
        notes: notes ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      ...result,
      elapsedMs,
      jobStatusAtReturn: job?.status ?? "queued",
      note: "Snapshot committed. The artifact does not exist yet and this release is not live.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
