"use client";

/**
 * The editing lock, from the browser's side.
 *
 * Whoever opens a page first edits it. Everyone else gets a read-only view —
 * and the interesting design question is what that view does while somebody else
 * types.
 *
 * Three options were on the table:
 *
 *   FROZEN, with a "reload" banner. Cheapest, and the worst: the viewer stares
 *   at content that is quietly out of date and has no idea, which is not just
 *   annoying but occasionally dangerous — they may act on what they see.
 *
 *   LIVE STREAMING, Figma-style. Feels wonderful, needs a socket per viewer,
 *   presence tracking and eventually CRDTs. It also contradicts the honest
 *   last-write-wins model the rest of this system uses.
 *
 *   POLL AND REFRESH — what this does. The viewer asks every few seconds
 *   whether the draft's version number has moved. When it has, the view
 *   refreshes itself and says when. No sockets, no new infrastructure, and the
 *   viewer is never looking at something stale without knowing.
 *
 * The poll is cheap because it compares a NUMBER, not content: `lock_version` is
 * the counter autosave already increments on every write. The response is a few
 * hundred bytes whether the page has three blocks or three hundred, and only a
 * viewer who is actually behind pays to fetch anything.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** How often a viewer asks whether anything changed. */
const POLL_MS = 3000;

export interface LockInfo {
  canEdit: boolean;
  lockedBy: { name: string; since: string } | null;
  draftVersion: number;
  heartbeatMs: number;
}

export interface LockStatus extends LockInfo {
  /** Set when the page changed under a viewer, so the UI can say so. */
  changedAt: number | null;
  /** True once the holder has gone and the viewer could take over. */
  canTakeOver: boolean;
  takeOver: () => void;
  /** Still working out who holds it — do not flash "read only" before we know. */
  resolving: boolean;
}

export function useLock(pageId: string, enabled = true): LockStatus {
  const router = useRouter();
  const [info, setInfo] = useState<LockInfo | null>(null);
  const [changedAt, setChangedAt] = useState<number | null>(null);
  const [canTakeOver, setCanTakeOver] = useState(false);
  const baseline = useRef<number | null>(null);

  const call = useCallback(
    async (method: "GET" | "POST" | "DELETE", action?: string): Promise<LockInfo | null> => {
      const url = `/api/pages/${pageId}/lock${action ? `?action=${action}` : ""}`;
      try {
        const res = await fetch(url, { method, cache: "no-store" });
        if (!res.ok) return null;
        return method === "DELETE" ? null : ((await res.json()) as LockInfo);
      } catch {
        return null;
      }
    },
    [pageId],
  );

  const takeOver = useCallback(() => {
    void call("POST", "acquire").then((next) => {
      if (next?.canEdit) {
        // Reload rather than switching mode in place. The draft may have moved
        // several times while we were watching, and re-reading it from the
        // server is the only honest way to start editing from the truth.
        router.refresh();
        window.location.reload();
      }
    });
  }, [call, router]);

  useEffect(() => {
    if (!enabled || !pageId) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const apply = (next: LockInfo | null) => {
      if (!alive || !next) return;
      setInfo(next);

      if (next.canEdit) {
        setCanTakeOver(false);
        baseline.current = next.draftVersion;
        return;
      }

      // A viewer. Has the page moved since we last looked?
      if (baseline.current === null) baseline.current = next.draftVersion;
      else if (next.draftVersion > baseline.current) {
        baseline.current = next.draftVersion;
        setChangedAt(Date.now());
        // Pull the new content in. The canvas is read-only, so there is no local
        // work to lose and nothing to reconcile.
        router.refresh();
      }
      setCanTakeOver(next.lockedBy === null);
    };

    // Claim it, then settle into either heartbeating or polling.
    void call("POST", "acquire").then((first) => {
      apply(first);
      if (!alive || !first) return;

      const interval = first.canEdit ? first.heartbeatMs : POLL_MS;
      timer = setInterval(() => {
        void call(first.canEdit ? "POST" : "GET", first.canEdit ? "heartbeat" : undefined).then(
          apply,
        );
      }, interval);
    });

    /**
     * Release on the way out.
     *
     * `keepalive` matters: an ordinary fetch is cancelled when the page goes
     * away, which is exactly when this needs to succeed. If it fails anyway the
     * lock simply expires — the heartbeat TTL is the real guarantee, and this is
     * the courtesy that stops the next person waiting 90 seconds for it.
     */
    const release = () => {
      const url = `/api/pages/${pageId}/lock?action=release`;
      const sent = navigator.sendBeacon?.(url);
      if (!sent) void fetch(url, { method: "POST", keepalive: true }).catch(() => {});
    };
    window.addEventListener("pagehide", release);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      window.removeEventListener("pagehide", release);
      void fetch(`/api/pages/${pageId}/lock`, { method: "DELETE", keepalive: true }).catch(
        () => {},
      );
    };
  }, [pageId, enabled, call, router]);

  return {
    canEdit: info?.canEdit ?? true,
    lockedBy: info?.lockedBy ?? null,
    draftVersion: info?.draftVersion ?? 0,
    heartbeatMs: info?.heartbeatMs ?? 20_000,
    changedAt,
    canTakeOver,
    takeOver,
    resolving: info === null,
  };
}
