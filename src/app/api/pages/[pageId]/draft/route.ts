/**
 * AUTOSAVE — the overwrite half of the two-speed save. (D2)
 *
 * Every ~2s the editor PUTs here. What arrives is what the storage model
 * actually is: the page's ordered list of component REFERENCES, plus a body for
 * every component this page owns.
 *
 * Both halves are written in one transaction, so a save can never leave a page
 * pointing at a component whose content did not land. Each row is still
 * overwrite-only — ten thousand keystrokes leave exactly one row per component
 * and one per page. Keystrokes are not history; publishing is.
 *
 * The lock granularity is worth noticing. The page's row guards the ARRANGEMENT,
 * and each component's row guards its own content. Two people editing different
 * blocks of the same page therefore write different rows and do not collide —
 * something that was impossible when a page was one JSON document.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidBody, readDraft } from "@/lib/drafts";
import { guardPage } from "@/lib/api-auth";
import { recordEdit } from "@/lib/activity";
import { lockState } from "@/lib/locks";
import { directComponentRefs } from "@/lib/shared-components";
import type { PageBody, PageNode } from "@/lib/registry/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const auth = await guardPage(pageId);
  if (!auth.ok) return auth.response;

  const draft = await readDraft("page", pageId);
  if (!draft) return NextResponse.json({ error: "No draft" }, { status: 404 });
  return NextResponse.json({
    body: draft.body,
    lockVersion: draft.lockVersion,
    updatedAt: draft.updatedAt,
  });
}

interface Payload {
  body?: unknown;
  /** componentId → that component's tree. Only components this page owns. */
  components?: Record<string, PageNode[]>;
  lockVersion?: unknown;
}

export async function PUT(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const auth = await guardPage(pageId);
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  // THE LOCK IS ENFORCED HERE, not in the editor.
  //
  // The read-only viewer's UI hides the controls, but a UI is a suggestion —
  // anyone can POST to this endpoint directly. Whoever does not hold the lock
  // cannot write, and finds out with a 423 rather than silently losing work.
  const lock = await lockState(pageId, userId);
  if (lock.held && !lock.isMine) {
    return NextResponse.json(
      {
        error: "locked",
        message: `${lock.by.name} is editing this page.`,
        lockedBy: { name: lock.by.name, since: lock.by.acquiredAt },
      },
      { status: 423 },
    );
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidBody(payload.body)) {
    return NextResponse.json({ error: "body must be {version, root: []}" }, { status: 400 });
  }
  const body = payload.body as PageBody;

  const page = await prisma.page.findFirst({ where: { id: pageId, deletedAt: null } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const existing = await prisma.pageDraft.findUnique({ where: { pageId } });
  const expected = payload.lockVersion;
  if (existing && typeof expected !== "number") {
    return NextResponse.json({ error: "lockVersion required" }, { status: 400 });
  }

  // Only components this page actually references may be written through it.
  // Without this check a page could rewrite any component on the site, including
  // one it has nothing to do with.
  const referenced = new Set(directComponentRefs(body.root));
  const incoming = Object.entries(payload.components ?? {}).filter(([id]) => referenced.has(id));

  const result = await prisma.$transaction(async (tx) => {
    // ── Component bodies ────────────────────────────────────────────────────
    // Created on first save. The editor mints the id when a block is dropped, so
    // by the time this runs the block has been on screen for a couple of seconds
    // and the row is catching up — the same deal the draft/publish split makes
    // everywhere else.
    for (const [componentId, root] of incoming) {
      const componentBody = { version: 1 as const, root };
      const kind = root[0]?.type ?? "Section";

      const found = await tx.component.findUnique({ where: { id: componentId } });
      if (!found) {
        await tx.component.create({
          data: {
            id: componentId,
            siteId: page.siteId,
            kind,
            draft: { create: { body: componentBody as never, updatedBy: userId, lockVersion: 1 } },
          },
        });
        continue;
      }
      if (found.siteId !== page.siteId) continue; // never cross a site boundary

      await tx.componentDraft.upsert({
        where: { componentId },
        create: { componentId, body: componentBody as never, updatedBy: userId, lockVersion: 1 },
        update: { body: componentBody as never, updatedBy: userId, lockVersion: { increment: 1 } },
      });
      if (found.kind !== kind) {
        await tx.component.update({ where: { id: componentId }, data: { kind } });
      }
    }

    // ── The arrangement ─────────────────────────────────────────────────────
    if (!existing) {
      const created = await tx.pageDraft.create({
        data: { pageId, body: body as never, updatedBy: userId, lockVersion: 1 },
      });
      return { ok: true as const, lockVersion: created.lockVersion, updatedAt: created.updatedAt };
    }

    const updated = await tx.pageDraft.updateMany({
      where: { pageId, lockVersion: expected as number },
      data: { body: body as never, updatedBy: userId, lockVersion: { increment: 1 } },
    });
    if (updated.count === 0) return { ok: false as const, currentVersion: existing.lockVersion };

    return {
      ok: true as const,
      lockVersion: (expected as number) + 1,
      updatedAt: new Date(),
    };
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: "conflict",
        message: "This page was edited in another tab.",
        yourVersion: expected,
        currentVersion: result.currentVersion,
      },
      { status: 409 },
    );
  }

  // Recorded once per editing SESSION, not once per autosave. A row every two
  // seconds would bury the log in noise and answer nothing useful; "Amar edited
  // /about" with a moving timestamp is the fact somebody actually wants.
  await recordEdit(auth.extra.siteId, userId, auth.user.name, pageId, page.path);

  return NextResponse.json({
    ok: true,
    lockVersion: result.lockVersion,
    updatedAt: result.updatedAt,
    componentsWritten: incoming.length,
  });
}
