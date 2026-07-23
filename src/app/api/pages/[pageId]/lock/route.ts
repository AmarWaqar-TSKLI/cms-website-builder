/**
 * The editing lock on one page.
 *
 *   POST   ?action=acquire   claim it, or find out who has it
 *   POST   ?action=heartbeat renew a lock you hold
 *   DELETE                   give it up
 *   GET                      who has it, and has the draft moved since I looked
 *
 * The GET is what makes the read-only experience bearable. A viewer polls it
 * every few seconds, and the response carries the draft's `lockVersion` — the
 * counter autosave already increments on every write. When it moves, the viewer
 * knows the page changed and can refresh itself, instead of staring at content
 * that quietly went stale.
 *
 * Sending the version rather than the content is the point: the poll stays a few
 * hundred bytes no matter how large the page is, and only a viewer who is
 * actually behind pays to fetch anything.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, requirePageAccess, requireUser } from "@/lib/auth";
import { HEARTBEAT_MS, LOCK_TTL_SECONDS, acquireLock, heartbeatLock, lockState, releaseLock } from "@/lib/locks";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[lock]", err);
  return NextResponse.json({ error: "Lock operation failed" }, { status: 500 });
}

/** The shape both POST and GET return, so the client has one thing to parse. */
async function payloadFor(pageId: string, state: Awaited<ReturnType<typeof lockState>>) {
  const draft = await prisma.pageDraft.findUnique({
    where: { pageId },
    select: { lockVersion: true, updatedAt: true },
  });

  return {
    canEdit: state.held ? state.isMine : true,
    lockedBy: state.held && !state.isMine ? { name: state.by.name, since: state.by.acquiredAt } : null,
    // What a polling viewer compares against. Moves on every autosave.
    draftVersion: draft?.lockVersion ?? 0,
    draftUpdatedAt: draft?.updatedAt ?? null,
    heartbeatMs: HEARTBEAT_MS,
    ttlSeconds: LOCK_TTL_SECONDS,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  try {
    const { pageId } = await params;
    const user = await requireUser();
    await requirePageAccess(user.id, pageId);
    return NextResponse.json(await payloadFor(pageId, await lockState(pageId, user.id)));
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  try {
    const { pageId } = await params;
    const user = await requireUser();
    await requirePageAccess(user.id, pageId);

    const action = new URL(req.url).searchParams.get("action") ?? "acquire";

    // `release` is reachable by POST as well as DELETE because navigator.
    // sendBeacon can only send POST, and a beacon is the one request that
    // reliably survives the tab closing — exactly when releasing matters most.
    if (action === "release") {
      await releaseLock(pageId, user.id);
      return NextResponse.json({ ok: true });
    }

    const state =
      action === "heartbeat"
        ? await heartbeatLock(pageId, user.id)
        : await acquireLock(pageId, user.id);

    return NextResponse.json(await payloadFor(pageId, state));
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  try {
    const { pageId } = await params;
    const user = await requireUser();
    await requirePageAccess(user.id, pageId);
    await releaseLock(pageId, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
