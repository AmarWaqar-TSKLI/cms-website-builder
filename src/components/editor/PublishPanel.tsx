"use client";

/**
 * Publish, watched happening.
 *
 * The panel shows the two jobs separately because they ARE separate: the
 * snapshot's elapsed time and the job's status at the moment the response
 * returned, then the build resolving afterwards via polling. Seeing "committed
 * in 47ms — job queued" followed a second later by "ready" is the clearest
 * statement of D4 the interface can make.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { flushDraft } from "@/lib/editor/useAutosave";
import { Badge, Dot, Mono, Note, SectionLabel } from "../ui";

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
        setError(data.error ?? "Publish failed");
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
      setError(err instanceof Error ? err.message : "Network error");
      setBusy(false);
    }
  }, [siteId, notes, onPublished]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <SectionLabel>Publish</SectionLabel>
        <Note>
          One transaction promotes every page&apos;s draft to an immutable revision and queues a
          build. It returns before anything is rendered.
        </Note>
      </div>

      <input
        className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13px] text-ink-100 outline-none placeholder:text-ink-600 focus:border-flux-500"
        placeholder="Release notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <button
        type="button"
        onClick={publish}
        disabled={busy}
        className="w-full rounded-xl bg-flux-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Publishing…" : "Publish site"}
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
            title={`Snapshot committed in ${snapshot.elapsedMs}ms`}
            detail={
              <>
                v{snapshot.versionNo} · {snapshot.pageCount} revisions appended ·{" "}
                {snapshot.dependencyCount} dependencies recorded
              </>
            }
          />
          <Step
            tone={snapshot.jobStatusAtReturn === "queued" ? "warn" : "building"}
            title={`Build job was “${snapshot.jobStatusAtReturn}” when publish returned`}
            detail="The API answered before any HTML existed. Nothing is live yet."
          />
          {release?.status === "building" && (
            <Step tone="building" pulse title="Worker is building…" detail="Separate process, polling build_jobs." />
          )}
          {release?.status === "ready" && (
            <Step
              tone="live"
              title="Artifact written — live pointer moved"
              detail={
                <>
                  <Mono className="text-ink-300">{release.id}</Mono>
                  <span className="mt-2 flex flex-wrap gap-2">
                    <a
                      className="text-flux-300 underline decoration-flux-500/40 underline-offset-2"
                      href={`/s/${siteSlug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      hosted
                    </a>
                    <a
                      className="text-flux-300 underline decoration-flux-500/40 underline-offset-2"
                      href={`/api/releases/${release.id}/export/static`}
                    >
                      static zip
                    </a>
                    <a
                      className="text-flux-300 underline decoration-flux-500/40 underline-offset-2"
                      href={`/api/releases/${release.id}/export/container`}
                    >
                      container
                    </a>
                  </span>
                </>
              }
            />
          )}
          {release?.status === "failed" && (
            <Step
              tone="failed"
              title="Build failed — site unaffected"
              detail={
                <>
                  {release.buildError}
                  <span className="mt-1 block text-ink-400">
                    The previous release is still being served. Retry from the releases panel.
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
