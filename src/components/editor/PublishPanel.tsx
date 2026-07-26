"use client";

/**
 * Publish, watched happening.
 *
 * Publishing is really two steps, and the panel shows them as two steps because
 * that is the honest picture: your changes are saved instantly, and then your
 * site is rebuilt in the background while the current one stays online. In plain
 * language by default; with "Technical details" on, each step also names the
 * transaction, the job and the pointer swap underneath it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { flushDraft } from "@/lib/editor/useAutosave";
import { Badge, Dot, Mono } from "../ui";
import { useTechnical } from "../technical";

interface PublishResponse {
  releaseId: string;
  versionNo: number;
  elapsedMs: number;
  jobStatusAtReturn: string;
  pageCount: number;
  dependencyCount: number;
}

interface ReleaseStatus {
  id: string;
  versionNo: number;
  status: "building" | "ready" | "failed";
  isLive: boolean;
  buildError: string | null;
  artifactUrl: string | null;
  site: { slug: string; customDomain: string | null };
}

export function PublishPanel({
  siteId,
  siteSlug,
  onPublished,
}: {
  siteId: string;
  siteSlug: string;
  onPublished?: () => void;
}) {
  const technical = useTechnical();
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<PublishResponse | null>(null);
  const [release, setRelease] = useState<ReleaseStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };
  useEffect(() => stopPolling, []);

  const publish = useCallback(async () => {
    setBusy(true);
    setError(null);
    setRelease(null);
    setSnapshot(null);

    // Make sure the draft on the server is what's on screen; publish snapshots
    // page_drafts, not the browser's memory.
    await flushDraft();

    try {
      const res = await fetch(`/api/sites/${siteId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong while publishing.");
        setBusy(false);
        return;
      }
      setSnapshot(data);
      setNotes("");

      // The build is somebody else's process now. Watch for it to land.
      stopPolling();
      poll.current = setInterval(async () => {
        const r = await fetch(`/api/releases/${data.releaseId}`);
        if (!r.ok) return;
        const status: ReleaseStatus = await r.json();
        setRelease(status);
        if (status.status !== "building") {
          stopPolling();
          setBusy(false);
          onPublished?.();
        }
      }, 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t reach the server. Check your connection.");
      setBusy(false);
    }
  }, [siteId, notes, onPublished]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="display text-[15px] text-ink-100">Publish</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
          Makes everything you’ve changed visible to the public. Your current site stays online
          until the new version is ready.
        </p>
      </div>

      <input
        className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13px] text-ink-100 outline-none placeholder:text-ink-600 focus:border-flux-500"
        placeholder="What changed? (optional)"
        aria-label="Note describing this version (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <button
        type="button"
        onClick={publish}
        disabled={busy}
        className="w-full rounded-xl bg-flux-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Publishing…" : "Publish changes"}
      </button>

      {error && (
        <div className="rounded-lg border border-fail-500/40 bg-fail-500/10 px-3 py-2 text-[12px] text-fail-500">
          {error}
        </div>
      )}

      {snapshot && (
        <div className="space-y-3 rounded-xl border border-ink-800 bg-ink-950 p-3">
          <Step
            tone="live"
            title="Saved this version"
            detail={
              <>
                Version {snapshot.versionNo} · {snapshot.pageCount} page
                {snapshot.pageCount === 1 ? "" : "s"}. Your changes are safely stored and can’t be
                lost.
                {technical && (
                  <span className="mt-1 block font-mono text-[10.5px] text-ink-500">
                    Snapshot committed in {snapshot.elapsedMs}ms · {snapshot.pageCount} revisions
                    appended · {snapshot.dependencyCount} dependencies recorded
                  </span>
                )}
              </>
            }
          />
          <Step
            tone={snapshot.jobStatusAtReturn === "queued" ? "warn" : "building"}
            title="Getting your site ready"
            detail={
              <>
                Nothing is public yet — the previous version is still what visitors see.
                {technical && (
                  <span className="mt-1 block font-mono text-[10.5px] text-ink-500">
                    Publish returned while the build job was “{snapshot.jobStatusAtReturn}”, before
                    any HTML existed.
                  </span>
                )}
              </>
            }
          />
          {release?.status === "building" && (
            <Step
              tone="building"
              pulse
              title="Building your site…"
              detail={
                technical
                  ? "A separate worker process is rendering it — polling build_jobs."
                  : "This usually takes a few seconds."
              }
            />
          )}
          {release?.status === "ready" && (
            <Step
              tone="live"
              title="Your site is live"
              detail={
                <>
                  Version {release.versionNo} is online for everyone.
                  {technical && (
                    <span className="mt-1 block">
                      <Mono className="text-ink-400">{release.id}</Mono>
                    </span>
                  )}
                  <span className="mt-2 flex flex-wrap gap-2">
                    <a
                      className="text-flux-300 underline decoration-flux-500/40 underline-offset-2"
                      href={`/s/${siteSlug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View live ↗
                    </a>
                    <a
                      className="text-flux-300 underline decoration-flux-500/40 underline-offset-2"
                      href={`/api/releases/${release.id}/export/static`}
                    >
                      Download .zip
                    </a>
                    <a
                      className="text-flux-300 underline decoration-flux-500/40 underline-offset-2"
                      href={`/api/releases/${release.id}/export/container`}
                    >
                      Container
                    </a>
                  </span>
                </>
              }
            />
          )}
          {release?.status === "failed" && (
            <Step
              tone="failed"
              title="Couldn’t build this version — your live site is safe"
              detail={
                <>
                  {release.buildError}
                  <span className="mt-1 block text-ink-400">
                    Your previous version is still online. You can try again from the dashboard.
                  </span>
                </>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

function Step({
  tone,
  title,
  detail,
  pulse,
}: {
  tone: "live" | "building" | "failed" | "warn";
  title: string;
  detail: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-1.5">
        <Dot tone={tone} pulse={pulse} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-ink-100">{title}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-ink-400">{detail}</div>
      </div>
    </div>
  );
}

export { Badge };
