/**
 * THE AUDIT TRAIL — who changed what, and when.
 *
 * Every entry is written at the moment of the event and never touched again;
 * the table has the same append-only trigger as the revision tables, because a
 * log the application can rewrite answers no question worth asking.
 *
 * Two details that look like duplication and are not:
 *
 *   `actorName` is copied in rather than joined at read time. Renaming a user
 *   must not silently rewrite six months of history, and an entry has to stay
 *   readable after the account is deleted.
 *
 *   `summary` is a finished sentence, written now. Reconstructing it later would
 *   mean reading rows that may since have changed — which is exactly what an
 *   audit trail exists to be independent of.
 *
 * Logging never throws. A failure to record history is not a reason to fail the
 * operation the user asked for; it is a reason to complain in the server log.
 */
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

export type ActivityAction =
  | "page.edited"
  | "page.created"
  | "page.deleted"
  | "component.created"
  | "component.renamed"
  | "component.deleted"
  | "site.published"
  | "site.rolled_back"
  | "site.domain_set"
  | "site.domain_removed"
  | "theme.updated"
  | "product.created"
  | "product.deleted"
  | "media.uploaded"
  | "media.deleted"
  | "post.created"
  | "post.published"
  | "post.deleted"
  | "form.submitted"
  | "form.deleted"
  | "user.signed_in"
  | "user.signed_out";

export interface ActivityInput {
  siteId?: string | null;
  userId?: string | null;
  actorName: string;
  action: ActivityAction;
  entityType?:
    | "page"
    | "component"
    | "release"
    | "theme"
    | "product"
    | "media"
    | "post"
    | "form"
    | "site"
    | null;
  entityId?: string | null;
  summary: string;
  meta?: Prisma.InputJsonValue;
}

export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        siteId: input.siteId ?? null,
        userId: input.userId ?? null,
        actorName: input.actorName,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        // Bounded: a summary is a sentence, and an unbounded string from a page
        // title is a way to bloat a table someone else has to read.
        summary: input.summary.slice(0, 300),
        meta: input.meta,
      },
    });
  } catch (err) {
    console.error("[activity] failed to record:", err instanceof Error ? err.message : err);
  }
}

/**
 * "Amar edited /about" — once per editing session, not once per autosave.
 *
 * Autosave fires every two seconds. Logging each one would put thirty rows a
 * minute into the table and answer nothing: nobody wants to read "edited,
 * edited, edited". What people actually want is "Amar was working on /about
 * this afternoon", so consecutive edits by the same person to the same page
 * collapse into one entry for a window.
 *
 * The window is tracked in memory. With several app servers each keeps its own,
 * so the worst case is one extra row per server per window — noticeably better
 * than a row every two seconds, and it costs no coordination.
 */
const EDIT_WINDOW_MS = 5 * 60_000;
const lastEdit = new Map<string, number>();

export async function recordEdit(
  siteId: string,
  userId: string,
  actorName: string,
  pageId: string,
  path: string,
): Promise<void> {
  const key = `${userId}:${pageId}`;
  const now = Date.now();
  const previous = lastEdit.get(key);

  lastEdit.set(key, now);
  if (previous && now - previous < EDIT_WINDOW_MS) return;

  // Keep the map from growing without bound in a long-lived process.
  if (lastEdit.size > 5000) {
    for (const [k, at] of lastEdit) if (now - at > EDIT_WINDOW_MS) lastEdit.delete(k);
  }

  await logActivity({
    siteId,
    userId,
    actorName,
    action: "page.edited",
    entityType: "page",
    entityId: pageId,
    summary: `${actorName} edited ${path}`,
  });
}

/**
 * Recent activity for a site, newest first.
 *
 * Capped, and the cap is not negotiable from the query string — an endpoint that
 * lets a caller choose the page size is an endpoint that lets them choose how
 * much work the database does.
 */
export async function recentActivity(siteId: string, limit = 40) {
  return prisma.activityLog.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, limit), 100),
  });
}

/** Everything that has happened to one page or component. */
export async function activityFor(entityType: string, entityId: string, limit = 20) {
  return prisma.activityLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, limit), 100),
  });
}

/** "3 minutes ago" — computed for display only, never stored. */
export function timeAgo(when: Date, now = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - when.getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}
