/**
 * POST /api/sites/:id/branch — fork a site into an editable branch.
 *
 * The branch is an ordinary site (own drafts, own editor, own /s/ address) that
 * remembers its parent, so it can later be diffed and merged back. Nothing about
 * the parent changes.
 */
import { NextResponse } from "next/server";
import { guardSite } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { captureError } from "@/lib/monitor";
import { forkSite } from "@/lib/branch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  try {
    const branch = await forkSite(siteId, auth.user.id);
    await logActivity({
      siteId,
      userId: auth.user.id,
      actorName: auth.user.name,
      action: "site.renamed",
      entityType: "site",
      entityId: branch.id,
      summary: `${auth.user.name} branched the site into “${branch.name}”`,
    });
    return NextResponse.json(branch);
  } catch (err) {
    captureError(err, { scope: "branch.fork", siteId });
    return NextResponse.json({ error: "Couldn't branch the site." }, { status: 500 });
  }
}
