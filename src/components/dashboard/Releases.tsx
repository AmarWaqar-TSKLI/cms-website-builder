"use client";

/**
 * Version history and rollback.
 *
 * The demo's money shot lives here: publish v1, publish v2, roll back, and the
 * live site instantly serves v1 again. Nothing is rebuilt — the v1 artifact
 * never left the disk. The UI states that plainly because it's the whole point.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge, Dot, Mono, Note, SectionLabel } from "../ui";

interface DependencyWarning {
  refType: string;
  refId: string;
  label: string;
  status: string;
}

interface ReleaseRow {
  id: string;
  versionNo: number;
  status: "building" | "ready" | "failed";
  notes: string | null;
  buildError: string | null;
  createdAt: string;
  itemCount: number;
  dependencyCount: number;
  isLive: boolean;
  job: { status: string; attempts: number; error: string | null } | null;
}

export function Releases({ siteId, siteSlug }: { siteId: string; siteSlug: string }) {
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  // Distinguished from "loaded and empty" so the panel never claims a site has
  // no releases while it is still fetching them.
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(
    null,
  );
  const [pending, setPending] = useState<{ releaseId: string; warnings: DependencyWarning[]; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/sites/${siteId}/releases`);
    if (!res.ok) return;
    const data = await res.json();
    setReleases(data.releases);
    setLoaded(true);
  }, [siteId]);

  useEffect(() => {
    load();
    // Keep the list warm so a build finishing elsewhere shows up here.
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, [load]);

  const rollback = useCallback(
    async (releaseId: string, acknowledge = false) => {
      setBusy(releaseId);
      setMessage(null);
      try {
        const res = await fetch(`/api/sites/${siteId}/rollback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ releaseId, acknowledgeWarnings: acknowledge }),
        });
        const data = await res.json();

        if (res.status === 409 && data.requiresAcknowledgement) {
          setPending({ releaseId, warnings: data.warnings ?? [], text: data.message });
          return;
        }
        if (!res.ok) {
          setMessage({ kind: "error", text: data.error ?? "Rollback failed" });
          return;
        }
        setPending(null);
        setMessage({
          kind: "ok",
          text: `Now serving v${data.versionNo}. Single-column update — nothing was rebuilt.`,
        });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [siteId, load],
  );

  const retry = useCallback(
    async (releaseId: string) => {
      setBusy(releaseId);
      await fetch(`/api/releases/${releaseId}/retry`, { method: "POST" });
      setBusy(null);
      await load();
    },
    [load],
  );

  return (
    <div className="p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <SectionLabel>Version history</SectionLabel>
          <Note>
            Every row is a site state you can return to. Rolling back changes one column and
            writes no files.
          </Note>
        </div>
        <Mono className="text-ink-500">releases · release_items</Mono>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-lg border px-3 py-2 text-[12px] ${
            message.kind === "ok"
              ? "border-live-500/40 bg-live-500/10 text-live-500"
              : "border-fail-500/40 bg-fail-500/10 text-fail-500"
          }`}
        >
          {message.text}
        </div>
      )}

      {pending && (
        <div className="mb-4 rounded-xl border border-warn-500/40 bg-warn-500/10 p-3">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-warn-500">
            <Dot tone="warn" /> Dependency check
          </div>
          <p className="mb-2 text-[12px] leading-relaxed text-ink-200">{pending.text}</p>
          <ul className="mb-3 space-y-1">
            {pending.warnings.map((w) => (
              <li key={`${w.refType}:${w.refId}`} className="text-[11px] text-ink-400">
                <Mono className="text-ink-300">{w.refType}</Mono> {w.label} —{" "}
                <span className="text-warn-500">{w.status}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => rollback(pending.releaseId, true)}
              className="rounded-lg bg-warn-500 px-3 py-1.5 text-[12px] font-semibold text-ink-950"
            >
              Roll back anyway
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-[12px] text-ink-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!loaded ? (
        <Note>Reading releases…</Note>
      ) : releases.length === 0 ? (
        <Note>No releases yet. Publish from the editor to create v1.</Note>
      ) : (
        <ol className="space-y-2">
          {releases.map((r) => (
            <li
              key={r.id}
              className={`rounded-xl border p-3 transition-colors ${
                r.isLive ? "border-live-500/40 bg-live-500/[0.06]" : "border-ink-800 bg-ink-950"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] font-medium text-ink-100">
                  v{r.versionNo}
                </span>

                {r.isLive && (
                  <Badge tone="live">
                    <Dot tone="live" /> live
                  </Badge>
                )}
                {r.status === "building" && (
                  <Badge tone="building">
                    <Dot tone="building" pulse /> building
                  </Badge>
                )}
                {r.status === "failed" && <Badge tone="failed">failed</Badge>}
                {r.status === "ready" && !r.isLive && <Badge tone="neutral">ready</Badge>}

                <span className="ml-auto text-[11px] text-ink-500">
                  {new Date(r.createdAt).toLocaleTimeString()}
                </span>
              </div>

              {r.notes && <p className="mt-1.5 text-[12px] text-ink-300">{r.notes}</p>}

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
                <span>{r.itemCount} pinned</span>
                <span>{r.dependencyCount} deps</span>
                <Mono className="text-ink-600">{r.id.slice(0, 8)}</Mono>
              </div>

              {r.buildError && (
                <p className="mt-2 rounded-md bg-fail-500/10 px-2 py-1 font-mono text-[10.5px] text-fail-500">
                  {r.buildError}
                </p>
              )}

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {r.status === "ready" && !r.isLive && (
                  <button
                    type="button"
                    onClick={() => rollback(r.id)}
                    disabled={busy === r.id}
                    className="rounded-lg border border-flux-500/50 bg-flux-500/10 px-2.5 py-1 text-[11px] font-medium text-flux-300 transition-colors hover:bg-flux-500/20 disabled:opacity-40"
                  >
                    {busy === r.id ? "…" : "Roll back to this version"}
                  </button>
                )}
                {r.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => retry(r.id)}
                    disabled={busy === r.id}
                    className="rounded-lg border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:border-ink-600 disabled:opacity-40"
                  >
                    Retry build
                  </button>
                )}
                {r.status === "ready" && (
                  <>
                    <a
                      href={`/s/${siteSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:border-ink-600"
                    >
                      {r.isLive ? "View live" : "Hosted URL"}
                    </a>
                    <a
                      href={`/api/releases/${r.id}/export/static`}
                      className="rounded-lg border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:border-ink-600"
                    >
                      .zip
                    </a>
                    <a
                      href={`/api/releases/${r.id}/export/container`}
                      className="rounded-lg border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:border-ink-600"
                    >
                      container
                    </a>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
