/**
 * AUTOSAVE — the overwrite half of the two-speed save. (D2)
 *
 * Every ~2s the editor PUTs the whole tree here. This route UPDATEs one row and
 * only ever one row: page_drafts has page_id as its PRIMARY KEY, so "one draft
 * per page" is a database guarantee rather than something this handler promises.
 *
 * Ten thousand keystrokes leave exactly one row behind. Keystrokes are not
 * history; publishing is. There is a test that autosaves ten times and asserts
 * the row count never moves off 1.
 *
 * The lock-and-overwrite logic itself lives in lib/drafts.ts, because shared
 * components save exactly the same way and one copy of an optimistic lock is
 * enough. This handler is now only the HTTP shape.
 */
import { NextResponse } from "next/server";
import { readDraft, saveDraft } from "@/lib/drafts";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const draft = await readDraft("page", pageId);
  if (!draft) return NextResponse.json({ error: "No draft" }, { status: 404 });
  return NextResponse.json({
    body: draft.body,
    lockVersion: draft.lockVersion,
    updatedAt: draft.updatedAt,
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const userId = await currentUserId();

  let payload: { body?: unknown; lockVersion?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await saveDraft("page", pageId, payload.body, payload.lockVersion, userId);
  if (!result.ok) {
    const { ok: _ok, status, ...rest } = result;
    return NextResponse.json({ ...rest, yourVersion: payload.lockVersion }, { status });
  }

  return NextResponse.json({ ok: true, lockVersion: result.lockVersion, updatedAt: result.updatedAt });
}
