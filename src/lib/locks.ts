/**
 * EDITING LOCKS — one editor per page, everybody else reads.
 *
 * The rule the product wants: whoever opens a page first edits it; anyone
 * arriving later gets a read-only view that keeps itself current.
 *
 * Three decisions carry the whole thing:
 *
 *   1. THE DATABASE DECIDES, NOT THE APPLICATION. `page_id` is the primary key
 *      of `page_locks`, so "one editor per page" is a constraint rather than
 *      something a handler remembers to check. Two people clicking at the same
 *      millisecond cannot both win — the second INSERT loses, and that failure
 *      IS the answer.
 *
 *   2. A LOCK IS A CLAIM THAT MUST BE RENEWED. The editor sends a heartbeat
 *      every 20 seconds; a lock unheard from for 90 is dead and can be taken.
 *      Without this, a closed laptop locks a page until someone opens a
 *      database console — the classic failure of pessimistic locking, and the
 *      reason people wrongly conclude it cannot be used.
 *
 *   3. TAKING A DEAD LOCK IS ATOMIC. The claim below is ONE statement:
 *      insert, or take over only if the holder is me or the lock has expired.
 *      Reading the lock and then writing it would be a race that two people
 *      hitting refresh together would eventually win.
 */
import { prisma } from "./db";

/** Unheard from for this long and the lock is considered abandoned. */
export const LOCK_TTL_SECONDS = 90;
/** The editor renews well inside the TTL, so one dropped request is harmless. */
export const HEARTBEAT_MS = 20_000;

export interface LockHolder {
  userId: string;
  name: string;
  email: string;
  acquiredAt: Date;
  heartbeatAt: Date;
}

export type LockState =
  /** You hold it. Edit away. */
  | { held: true; by: LockHolder; isMine: true }
  /** Somebody else holds it. Read-only. */
  | { held: true; by: LockHolder; isMine: false }
  /** Nobody holds it. */
  | { held: false };

async function holderOf(pageId: string): Promise<LockHolder | null> {
  const lock = await prisma.pageLock.findUnique({
    where: { pageId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!lock) return null;
  return {
    userId: lock.userId,
    name: lock.user.name,
    email: lock.user.email,
    acquiredAt: lock.acquiredAt,
    heartbeatAt: lock.heartbeatAt,
  };
}

/**
 * Claim the page, or find out who has it.
 *
 * One statement does the whole thing. The WHERE on the DO UPDATE is the
 * interesting part: the row is only overwritten when the current holder is the
 * same user (a refresh, or a second tab) or when their heartbeat has gone stale.
 * Any other case updates nothing, returns nothing, and the caller learns they
 * are a viewer.
 */
export async function acquireLock(pageId: string, userId: string): Promise<LockState> {
  const rows = await prisma.$queryRaw<{ user_id: string }[]>`
    INSERT INTO page_locks (page_id, user_id, acquired_at, heartbeat_at)
    VALUES (${pageId}, ${userId}, now(), now())
    ON CONFLICT (page_id) DO UPDATE
       SET user_id     = EXCLUDED.user_id,
           acquired_at = CASE WHEN page_locks.user_id = EXCLUDED.user_id
                              THEN page_locks.acquired_at ELSE now() END,
           heartbeat_at = now()
     WHERE page_locks.user_id = EXCLUDED.user_id
        OR page_locks.heartbeat_at < now() - make_interval(secs => ${LOCK_TTL_SECONDS})
    RETURNING user_id
  `;

  const holder = await holderOf(pageId);
  if (!holder) return { held: false };
  return { held: true, by: holder, isMine: rows.length > 0 && holder.userId === userId };
}

/**
 * Renew a lock you already hold.
 *
 * Scoped to the holder, so a viewer cannot keep someone else's lock alive — or
 * quietly steal it by heartbeating a page they never acquired.
 */
export async function heartbeatLock(pageId: string, userId: string): Promise<LockState> {
  await prisma.pageLock.updateMany({
    where: { pageId, userId },
    data: { heartbeatAt: new Date() },
  });
  return lockState(pageId, userId);
}

/** Give it up. Only the holder can. */
export async function releaseLock(pageId: string, userId: string): Promise<void> {
  await prisma.pageLock.deleteMany({ where: { pageId, userId } });
}

/**
 * Who has this page right now, from the caller's point of view.
 *
 * An expired lock reads as free even though the row is still there. Cleaning it
 * up is the next acquirer's job — a reader should never have to write.
 */
export async function lockState(pageId: string, userId: string): Promise<LockState> {
  const holder = await holderOf(pageId);
  if (!holder) return { held: false };

  const stale = Date.now() - holder.heartbeatAt.getTime() > LOCK_TTL_SECONDS * 1000;
  if (stale) return { held: false };

  return { held: true, by: holder, isMine: holder.userId === userId };
}

/** Locks across a whole site, so the dashboard can show "Amar is editing /about". */
export async function siteLocks(siteId: string) {
  const cutoff = new Date(Date.now() - LOCK_TTL_SECONDS * 1000);
  const locks = await prisma.pageLock.findMany({
    where: { page: { siteId }, heartbeatAt: { gte: cutoff } },
    include: { user: { select: { id: true, name: true } }, page: { select: { path: true } } },
  });
  return locks.map((l) => ({
    pageId: l.pageId,
    path: l.page.path,
    userId: l.userId,
    name: l.user.name,
    since: l.acquiredAt,
  }));
}
