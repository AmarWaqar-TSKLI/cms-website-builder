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
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import type { PageBody } from "@/lib/registry/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const draft = await prisma.pageDraft.findUnique({ where: { pageId } });
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

  let payload: { body?: PageBody; lockVersion?: number };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = payload.body;
  if (!body || typeof body !== "object" || !Array.isArray(body.root)) {
    return NextResponse.json({ error: "body must be {version, root: []}" }, { status: 400 });
  }

  const page = await prisma.page.findFirst({ where: { id: pageId, deletedAt: null } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const existing = await prisma.pageDraft.findUnique({ where: { pageId } });

  if (!existing) {
    const created = await prisma.pageDraft.create({
      data: { pageId, body: body as never, updatedBy: userId, lockVersion: 1 },
    });
    return NextResponse.json({ ok: true, lockVersion: created.lockVersion, updatedAt: created.updatedAt });
  }

  const expected = payload.lockVersion;
  if (typeof expected !== "number") {
    return NextResponse.json({ error: "lockVersion required" }, { status: 400 });
  }

  // Optimistic lock. updateMany's count tells us whether OUR version was the
  // one on disk; a second tab that saved in between makes this match nothing.
  const result = await prisma.pageDraft.updateMany({
    where: { pageId, lockVersion: expected },
    data: { body: body as never, updatedBy: userId, lockVersion: { increment: 1 } },
  });

  if (result.count === 0) {
    return NextResponse.json(
      {
        error: "conflict",
        message: "This page was edited in another tab.",
        yourVersion: expected,
        currentVersion: existing.lockVersion,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, lockVersion: expected + 1, updatedAt: new Date() });
}
