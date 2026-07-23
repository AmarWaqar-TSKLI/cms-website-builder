/**
 * The overwrite half of the two-speed save (D2), for both things that have drafts.
 *
 * Pages and shared components store drafts identically — one row keyed by the
 * parent's id, overwritten every couple of seconds, guarded by an optimistic
 * lock. That is not a coincidence to be papered over with two similar route
 * handlers; it is one rule applied to two entities, so it lives in one function.
 *
 * The lock is the part worth keeping single-sourced. `updateMany` filtered on the
 * version we *think* is current tells us, by its count, whether we actually had
 * the current row. A second tab that saved in between makes the filter match
 * nothing, count comes back 0, and the caller gets an honest 409 instead of
 * silently clobbering someone's work.
 */
import { prisma } from "./db";
import type { PageBody } from "./registry/types";

export type DraftKind = "page" | "component";

export type DraftSaveResult =
  | { ok: true; lockVersion: number; updatedAt: Date }
  | { ok: false; status: 400 | 404 | 409; error: string; message?: string; currentVersion?: number };

/** Validate the wire shape. A body is {version, root: []} or it is not a body. */
export function isValidBody(body: unknown): body is PageBody {
  return (
    !!body &&
    typeof body === "object" &&
    Array.isArray((body as PageBody).root)
  );
}

async function targetExists(kind: DraftKind, id: string): Promise<boolean> {
  if (kind === "page") {
    return (await prisma.page.count({ where: { id, deletedAt: null } })) > 0;
  }
  return (await prisma.component.count({ where: { id, deletedAt: null } })) > 0;
}

export async function readDraft(kind: DraftKind, id: string) {
  return kind === "page"
    ? prisma.pageDraft.findUnique({ where: { pageId: id } })
    : prisma.componentDraft.findUnique({ where: { componentId: id } });
}

export async function saveDraft(
  kind: DraftKind,
  id: string,
  body: unknown,
  lockVersion: unknown,
  userId: string | null,
): Promise<DraftSaveResult> {
  if (!isValidBody(body)) {
    return { ok: false, status: 400, error: "body must be {version, root: []}" };
  }
  if (!(await targetExists(kind, id))) {
    return { ok: false, status: 404, error: `${kind} not found` };
  }

  const existing = await readDraft(kind, id);

  // First save for this entity — there is nothing to race with yet.
  if (!existing) {
    const created =
      kind === "page"
        ? await prisma.pageDraft.create({
            data: { pageId: id, body: body as never, updatedBy: userId, lockVersion: 1 },
          })
        : await prisma.componentDraft.create({
            data: { componentId: id, body: body as never, updatedBy: userId, lockVersion: 1 },
          });
    return { ok: true, lockVersion: created.lockVersion, updatedAt: created.updatedAt };
  }

  if (typeof lockVersion !== "number") {
    return { ok: false, status: 400, error: "lockVersion required" };
  }

  const result =
    kind === "page"
      ? await prisma.pageDraft.updateMany({
          where: { pageId: id, lockVersion },
          data: { body: body as never, updatedBy: userId, lockVersion: { increment: 1 } },
        })
      : await prisma.componentDraft.updateMany({
          where: { componentId: id, lockVersion },
          data: { body: body as never, updatedBy: userId, lockVersion: { increment: 1 } },
        });

  if (result.count === 0) {
    return {
      ok: false,
      status: 409,
      error: "conflict",
      message:
        kind === "page"
          ? "This page was edited in another tab."
          : "This component was edited in another tab.",
      currentVersion: existing.lockVersion,
    };
  }

  return { ok: true, lockVersion: lockVersion + 1, updatedAt: new Date() };
}
