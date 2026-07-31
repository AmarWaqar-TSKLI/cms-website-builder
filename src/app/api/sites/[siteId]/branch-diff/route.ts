/**
 * GET /api/sites/:id/branch-diff — the block-level diff of a branch vs its parent.
 *
 * Reads only; it's the review view before a merge. `:id` is the branch.
 */
import { NextResponse } from "next/server";
import { guardSite } from "@/lib/api-auth";
import { diffBranch } from "@/lib/branch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(await diffBranch(siteId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't compute the diff.";
    const status = message.includes("isn't a branch") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
