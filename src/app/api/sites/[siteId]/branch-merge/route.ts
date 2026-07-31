/**
 * POST /api/sites/:id/branch-merge — merge a branch's changes into its parent.
 *
 * Applies the branch's changed blocks (matched to the parent by stable node id)
 * and its theme, then publishes the parent as ONE release — so the merge goes
 * live atomically and can be rolled back with a single click. `:id` is the branch.
 */
import { NextResponse } from "next/server";
import { guardSite } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { captureError } from "@/lib/monitor";
import { mergeBranch } from "@/lib/branch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  // Optional cherry-pick: {nodeIds?: string[], includeTheme?: boolean}. Omitted
  // (or empty) merges everything, so the simple "merge all" call still works.
  let body: { nodeIds?: unknown; includeTheme?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* no body → merge all */
  }
  const nodeIds = Array.isArray(body.nodeIds)
    ? body.nodeIds.filter((x): x is string => typeof x === "string")
    : null;
  const includeTheme = typeof body.includeTheme === "boolean" ? body.includeTheme : true;

  try {
    const result = await mergeBranch(siteId, auth.user.id, true, { nodeIds, includeTheme });
    if (result.versionNo !== null) {
      await logActivity({
        siteId: result.parentId,
        userId: auth.user.id,
        actorName: auth.user.name,
        action: "site.published",
        entityType: "release",
        entityId: result.parentId,
        summary: `${auth.user.name} merged a branch (${result.blocksMerged} block${
          result.blocksMerged === 1 ? "" : "s"
        }${result.themeMerged ? " + theme" : ""}) and published v${result.versionNo}`,
        meta: { ...result },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    // A branch whose parent is gone, etc. — surface, don't 500 blindly.
    const known = err instanceof Error && err.message.includes("isn't a branch");
    if (!known) captureError(err, { scope: "branch.merge", siteId });
    return NextResponse.json(
      { error: known ? (err as Error).message : "Couldn't merge the branch." },
      { status: known ? 400 : 500 },
    );
  }
}
