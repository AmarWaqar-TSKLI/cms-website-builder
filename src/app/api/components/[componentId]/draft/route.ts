/**
 * Autosave for a shared component. Byte for byte the same contract as a page's
 * draft — same overwrite-only row, same optimistic lock, same 409 — because a
 * symbol is edited with the same editor and deserves the same guarantees.
 *
 * Editing here is the whole point of the feature: this one row is what forty
 * pages are pointing at.
 */
import { NextResponse } from "next/server";
import { readDraft, saveDraft } from "@/lib/drafts";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ componentId: string }> },
) {
  const { componentId } = await params;
  const draft = await readDraft("component", componentId);
  if (!draft) return NextResponse.json({ error: "No draft" }, { status: 404 });
  return NextResponse.json({
    body: draft.body,
    lockVersion: draft.lockVersion,
    updatedAt: draft.updatedAt,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ componentId: string }> },
) {
  const { componentId } = await params;
  const userId = await currentUserId();

  let payload: { body?: unknown; lockVersion?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await saveDraft("component", componentId, payload.body, payload.lockVersion, userId);
  if (!result.ok) {
    const { ok: _ok, status, ...rest } = result;
    return NextResponse.json({ ...rest, yourVersion: payload.lockVersion }, { status });
  }

  return NextResponse.json({ ok: true, lockVersion: result.lockVersion, updatedAt: result.updatedAt });
}
