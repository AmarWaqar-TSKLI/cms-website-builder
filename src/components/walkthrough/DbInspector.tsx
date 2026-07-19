"use client";

/**
 * The live database inspector.
 *
 * The argument of this whole project reduces to two numbers sitting next to
 * each other: page_drafts stays at one row per page no matter how much you
 * type, and page_revisions only ever grows, one row per page per publish.
 *
 * Being told that is unconvincing. Watching it is not. So the buttons here
 * drive the real APIs — real autosaves, a real publish, a real rollback — and
 * the counters update underneath.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Dot, Mono, Note } from "../ui";

interface Snapshot {
  site: { id: string; name: string; slug: string; customDomain: string | null; liveReleaseId: string | null };
  counts: Record<string, number>;
  pages: {
    id: string;
    path: string;
    title: string;
    revisionCount: number;
    draft: { lockVersion: number; updatedAt: string; bytes: number } | null;
  }[];
  recentRevisions: { id: string; path: string; versionNo: number; createdAt: string; bytes: number }[];
  releases: { id: string; versionNo: number; status: string; isLive: boolean }[];
  artifacts: { releaseId: string; files: { name: string; bytes: number; mtime: string }[] }[];
}

const WATCHED: { key: string; label: string; hint: string }[] = [
  { key: "page_drafts", label: "page_drafts", hint: "OVERWRITTEN — one row per page, forever" },
  { key: "page_revisions", label: "page_revisions", hint: "APPEND ONLY — grows on every publish" },
  { key: "releases", label: "releases", hint: "one per publish" },
  { key: "release_items", label: "release_items", hint: "the manifest" },
  { key: "release_dependencies", label: "release_dependencies", hint: "references into live data" },
  { key: "build_jobs", label: "build_jobs", hint: "the queue" },
  { key: "products", label: "products", hint: "live — never versioned" },
  { key: "orders", label: "orders", hint: "live — never rolls back" },
];

export function DbInspector() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const prev = useRef<Record<string, number>>({});

  const say = (msg: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...l].slice(0, 8));

  const load = useCallback(async () => {
    const res = await fetch("/api/debug/db");
    if (!res.ok) return;
    const data: Snapshot = await res.json();

    const moved = new Set<string>();
    for (const [k, v] of Object.entries(data.counts)) {
      if (prev.current[k] !== undefined && prev.current[k] !== v) moved.add(k);
    }
    prev.current = data.counts;
    setSnap(data);
    if (moved.size) {
      setChanged(moved);
      setTimeout(() => setChanged(new Set()), 1200);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 1200);
    return () => clearInterval(timer);
  }, [load]);

  /** Ten genuine autosaves against a real page. Watch page_drafts not move. */
  const autosaveBurst = async () => {
    if (!snap?.pages[0]) return;
    setBusy("autosave");
    const pageId = snap.pages[0].id;

    const res = await fetch(`/api/pages/${pageId}/draft`);
    if (!res.ok) {
      setBusy(null);
      return;
    }
    const { body, lockVersion } = await res.json();
    let version = lockVersion;

    for (let i = 1; i <= 10; i++) {
      const put = await fetch(`/api/pages/${pageId}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, lockVersion: version }),
      });
      if (!put.ok) break;
      version = (await put.json()).lockVersion;
      await new Promise((r) => setTimeout(r, 90));
    }
    say(`10 autosaves → page_drafts still ${snap.counts.page_drafts} rows, lock_version now ${version}`);
    setBusy(null);
    load();
  };

  const publish = async () => {
    if (!snap) return;
    setBusy("publish");
    const res = await fetch(`/api/sites/${snap.site.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "published from the walkthrough" }),
    });
    const data = await res.json();
    if (!res.ok) {
      say(`publish failed: ${data.error}`);
      setBusy(null);
      return;
    }
    say(
      `publish returned in ${data.elapsedMs}ms — job was “${data.jobStatusAtReturn}”, no HTML existed yet`,
    );

    // Watch the separate worker process pick it up.
    const started = Date.now();
    const poll = setInterval(async () => {
      const r = await fetch(`/api/releases/${data.releaseId}`);
      const status = await r.json();
      if (status.status !== "building" || Date.now() - started > 30000) {
        clearInterval(poll);
        setBusy(null);
        say(
          status.status === "ready"
            ? `worker finished v${status.versionNo} after ${Date.now() - started}ms — live pointer moved`
            : `build ${status.status}: ${status.buildError ?? "timed out"}`,
        );
        load();
      }
    }, 400);
  };

  const rollback = async () => {
    if (!snap) return;
    const target = snap.releases.find((r) => r.status === "ready" && !r.isLive);
    if (!target) {
      say("need at least two successful releases to roll back");
      return;
    }
    setBusy("rollback");
    const res = await fetch(`/api/sites/${snap.site.id}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ releaseId: target.id, acknowledgeWarnings: true }),
    });
    const data = await res.json();
    say(
      res.ok
        ? `rolled back to v${data.versionNo} — one column changed, zero files written`
        : `rollback failed: ${data.error}`,
    );
    setBusy(null);
    load();
  };

  if (!snap) {
    return (
      <div className="rounded-2xl border border-ink-700 bg-ink-900/80 p-8 text-center">
        <Note>Reading the database…</Note>
      </div>
    );
  }

  const liveRelease = snap.releases.find((r) => r.isLive);

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Action onClick={autosaveBurst} busy={busy === "autosave"} disabled={!!busy}>
          Fire 10 autosaves
        </Action>
        <Action onClick={publish} busy={busy === "publish"} disabled={!!busy} primary>
          Publish
        </Action>
        <Action onClick={rollback} busy={busy === "rollback"} disabled={!!busy}>
          Roll back one version
        </Action>
      </div>

      {/* Counters — the two that matter are marked. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {WATCHED.map((w) => {
          const highlight = w.key === "page_drafts" || w.key === "page_revisions";
          return (
            <div
              key={w.key}
              className={`rounded-xl border p-3 ${
                highlight ? "border-flux-500/40 bg-flux-500/[0.06]" : "border-ink-800 bg-ink-950"
              } ${changed.has(w.key) ? "cms-flash" : ""}`}
            >
              <div className="font-mono text-xl text-ink-100">{snap.counts[w.key] ?? 0}</div>
              <div className="mt-0.5 font-mono text-[10px] text-ink-400">{w.label}</div>
              <div className="mt-1 text-[10px] leading-snug text-ink-500">{w.hint}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Per-page: 1 draft, N revisions. */}
        <div className="rounded-2xl border border-ink-700 bg-ink-900/80 p-4">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
            Per page
          </div>
          <ul className="space-y-2">
            {snap.pages.map((p) => (
              <li key={p.id} className="rounded-lg border border-ink-800 bg-ink-950 p-2.5">
                <div className="flex items-center gap-2">
                  <Mono className="text-ink-100">{p.path}</Mono>
                  <span className="ml-auto text-[11px] text-ink-500">{p.title}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-md bg-ink-800 px-2 py-0.5 text-ink-300">
                    drafts: <span className="font-mono text-ink-100">{p.draft ? 1 : 0}</span>
                  </span>
                  <span className="rounded-md bg-ink-800 px-2 py-0.5 text-ink-300">
                    revisions: <span className="font-mono text-flux-300">{p.revisionCount}</span>
                  </span>
                  {p.draft && (
                    <span className="rounded-md bg-ink-800 px-2 py-0.5 text-ink-400">
                      lock_version {p.draft.lockVersion}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Note className="mt-3">
            The draft count is a database guarantee: page_drafts has page_id as its PRIMARY KEY.
          </Note>
        </div>

        {/* Artifacts on disk. */}
        <div className="rounded-2xl border border-ink-700 bg-ink-900/80 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
              Artifacts on disk
            </span>
            <Mono className="text-ink-600">./artifacts/</Mono>
          </div>
          {snap.artifacts.length === 0 ? (
            <Note>Nothing built yet.</Note>
          ) : (
            <ul className="space-y-2">
              {snap.artifacts.map((a) => {
                const rel = snap.releases.find((r) => r.id === a.releaseId);
                return (
                  <li key={a.releaseId} className="rounded-lg border border-ink-800 bg-ink-950 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Mono className="text-ink-300">{a.releaseId.slice(0, 8)}</Mono>
                      {rel && <span className="font-mono text-[11px] text-ink-400">v{rel.versionNo}</span>}
                      {rel?.isLive && (
                        <Badge tone="live">
                          <Dot tone="live" /> serving
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[10.5px] leading-relaxed text-ink-500">
                      {a.files.map((f) => (
                        <div key={f.name}>
                          {f.name} · {(f.bytes / 1024).toFixed(1)}kb
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Note className="mt-3">
            Old release directories are never touched again. Rollback re-points at one of these;
            it does not regenerate it.
          </Note>
        </div>
      </div>

      {/* Newest revisions, so a publish visibly appends. */}
      <div className="rounded-2xl border border-ink-700 bg-ink-900/80 p-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
          page_revisions (newest first)
        </div>
        <div className="max-h-52 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-wider text-ink-600">
                <th className="pb-2 font-normal">path</th>
                <th className="pb-2 font-normal">version_no</th>
                <th className="pb-2 font-normal">bytes</th>
                <th className="pb-2 font-normal">created_at</th>
              </tr>
            </thead>
            <tbody className="font-mono text-[11px]">
              {snap.recentRevisions.map((r) => (
                <tr key={r.id} className="border-t border-ink-850">
                  <td className="py-1.5 text-ink-200">{r.path}</td>
                  <td className="py-1.5 text-flux-300">{r.versionNo}</td>
                  <td className="py-1.5 text-ink-500">{r.bytes}</td>
                  <td className="py-1.5 text-ink-500">
                    {new Date(r.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Three destinations, one id. */}
      {liveRelease && (
        <div className="rounded-2xl border border-ink-700 bg-ink-900/80 p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
            Three destinations · one release id
          </div>
          <Mono className="mb-3 block text-flux-300">{liveRelease.id}</Mono>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/s/${snap.site.slug}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-[12px] text-ink-200 hover:border-flux-500/50"
            >
              Hosted → /s/{snap.site.slug}
            </a>
            {snap.site.customDomain && (
              <a
                href={`/?host=${snap.site.customDomain}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-ink-700 px-3 py-1.5 text-[12px] text-ink-200 hover:border-flux-500/50"
              >
                Domain → {snap.site.customDomain}
              </a>
            )}
            <a
              href={`/api/releases/${liveRelease.id}/export/static`}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-[12px] text-ink-200 hover:border-flux-500/50"
            >
              Static .zip
            </a>
            <a
              href={`/api/releases/${liveRelease.id}/export/container`}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-[12px] text-ink-200 hover:border-flux-500/50"
            >
              Container bundle
            </a>
          </div>
        </div>
      )}

      {/* Activity log. */}
      {log.length > 0 && (
        <div className="rounded-2xl border border-ink-700 bg-ink-950 p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
            What just happened
          </div>
          <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-ink-300">
            {log.map((line, i) => (
              <li key={`${line}-${i}`} className={i === 0 ? "text-flux-300" : ""}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Action({
  children,
  onClick,
  busy,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? "bg-flux-500 text-white hover:bg-flux-400"
          : "border border-ink-700 text-ink-200 hover:border-ink-600"
      }`}
    >
      {busy ? "Working…" : children}
    </button>
  );
}
