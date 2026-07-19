"use client";

/**
 * The dashboard.
 *
 * Reading order is deliberate, top to bottom:
 *   1. what your site is and whether it is online   (hero)
 *   2. the pages you can edit                       (left column)
 *   3. publishing, and every version you can return to (right column)
 *   4. taking the site elsewhere                    (exports)
 *   5. the store                                    (commerce)
 *   6. how any of this works                        (the disclosure at the end)
 *
 * Everything release-shaped lives in one client component because publishing is
 * asynchronous: a build finishing has to update the headline, the history list
 * and the export links at the same moment.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Dot, cx } from "../ui";
import { Ago } from "./Ago";
import { Btn, Card, CardHead, LinkBtn, Tile, UnderTheHood, exactTime, money } from "./dash-ui";

/* ── shapes ───────────────────────────────────────────────────────────────── */

export interface DashSite {
  id: string;
  name: string;
  slug: string;
  orgName: string;
  customDomain: string | null;
  modules: string[];
  liveReleaseId: string | null;
}

export interface DashPage {
  id: string;
  path: string;
  title: string;
  revisionCount: number;
  hasDraft: boolean;
  draftUpdatedAt: string | null;
  lockVersion: number | null;
}

export interface DashCommerce {
  productCount: number;
  orderCount: number;
  revenueCents: number;
}

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

type Flash = { kind: "ok" | "error" | "info"; text: string } | null;

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ── shell ────────────────────────────────────────────────────────────────── */

export function DashboardShell({
  site,
  pages,
  commerce,
}: {
  site: DashSite;
  pages: DashPage[];
  commerce: DashCommerce;
}) {
  const [releases, setReleases] = useState<ReleaseRow[] | null>(null);
  const [liveId, setLiveId] = useState<string | null>(site.liveReleaseId);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [flash, setFlash] = useState<Flash>(null);
  const [confirm, setConfirm] = useState<{
    releaseId: string;
    versionNo: number;
    warnings: DependencyWarning[];
    message: string;
  } | null>(null);
  const [watching, setWatching] = useState<{ releaseId: string; versionNo: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${site.id}/releases`);
      if (!res.ok) return;
      const data = await res.json();
      setReleases(data.releases as ReleaseRow[]);
      setLiveId(data.liveReleaseId ?? null);
    } catch {
      /* the poll simply tries again */
    }
  }, [site.id]);

  const building = (releases ?? []).some((r) => r.status === "building") || watching !== null;

  useEffect(() => {
    load();
    const timer = setInterval(load, building ? 1200 : 5000);
    return () => clearInterval(timer);
  }, [load, building]);

  /* publish: returns immediately, so watch the build to completion */
  const publish = useCallback(async () => {
    setBusy("publish");
    setFlash(null);
    try {
      const res = await fetch(`/api/sites/${site.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFlash({ kind: "error", text: data.error ?? "Something went wrong while publishing." });
        return;
      }
      setNotes("");
      setWatching({ releaseId: data.releaseId, versionNo: data.versionNo });
      await load();
    } catch {
      setFlash({ kind: "error", text: "Could not reach the server. Check your connection." });
    } finally {
      setBusy(null);
    }
  }, [site.id, notes, load]);

  useEffect(() => {
    if (!watching) return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/releases/${watching.releaseId}`);
        if (!res.ok || !alive) return;
        const data = await res.json();
        if (data.status === "ready") {
          setWatching(null);
          setFlash({
            kind: "ok",
            text: `Version ${data.versionNo} is live. Your site was rebuilt and published.`,
          });
          load();
        } else if (data.status === "failed") {
          setWatching(null);
          setFlash({
            kind: "error",
            text: `Version ${data.versionNo} could not be built. Your previous version is still live — you can try again below.`,
          });
          load();
        }
      } catch {
        /* keep waiting */
      }
    }, 800);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [watching, load]);

  const restore = useCallback(
    async (releaseId: string, versionNo: number, acknowledge = false) => {
      setBusy(releaseId);
      setFlash(null);
      try {
        const res = await fetch(`/api/sites/${site.id}/rollback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ releaseId, acknowledgeWarnings: acknowledge }),
        });
        const data = await res.json();

        if (res.status === 409 && data.requiresAcknowledgement) {
          setConfirm({
            releaseId,
            versionNo,
            warnings: data.warnings ?? [],
            message: data.message ?? "",
          });
          return;
        }
        if (!res.ok) {
          setFlash({ kind: "error", text: data.error ?? "That version could not be restored." });
          return;
        }
        setConfirm(null);
        setFlash({
          kind: "ok",
          text: `Version ${data.versionNo} is live again — visitors see it right now. Now serving v${data.versionNo} from files that never left the disk, so nothing had to be rebuilt.`,
        });
        await load();
      } finally {
        setBusy(null);
      }
    },
    [site.id, load],
  );

  const retry = useCallback(
    async (releaseId: string) => {
      setBusy(releaseId);
      await fetch(`/api/releases/${releaseId}/retry`, { method: "POST" });
      setBusy(null);
      setFlash({ kind: "info", text: "Trying that build again…" });
      await load();
    },
    [load],
  );

  /* derived facts, in plain terms */
  const live = useMemo(
    () => (releases ?? []).find((r) => r.id === liveId) ?? null,
    [releases, liveId],
  );
  const lastReady = useMemo(
    () => (releases ?? []).find((r) => r.status === "ready") ?? null,
    [releases],
  );
  const lastPublishedAt = lastReady?.createdAt ?? null;
  const loaded = releases !== null;
  const buildingRelease = (releases ?? []).find((r) => r.status === "building") ?? null;
  const exportReleaseId = live?.id ?? liveId ?? null;
  const editHref = pages.length ? `/editor/${pages[0].id}` : "/dashboard";

  const pagesWithEdits = pages.filter(
    (p) =>
      p.draftUpdatedAt &&
      lastPublishedAt &&
      new Date(p.draftUpdatedAt).getTime() > new Date(lastPublishedAt).getTime(),
  ).length;

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1140px] px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
      <TopBar />

      {/* ── 1. your site ─────────────────────────────────────────────────── */}
      <Hero
        site={site}
        live={live}
        loaded={loaded}
        building={building}
        buildingVersion={watching?.versionNo ?? buildingRelease?.versionNo ?? null}
        publishing={busy === "publish"}
        onPublish={publish}
        editHref={editHref}
      />

      {flash && (
        <div
          role="status"
          className={cx(
            "mt-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-[12.5px] leading-relaxed",
            flash.kind === "ok"
              ? "border-live-500/35 bg-live-500/10 text-live-500"
              : flash.kind === "error"
                ? "border-fail-500/35 bg-fail-500/10 text-fail-500"
                : "border-flux-500/35 bg-flux-500/10 text-flux-300",
          )}
        >
          <span className="flex-1">{flash.text}</span>
          <button
            type="button"
            onClick={() => setFlash(null)}
            aria-label="Dismiss this message"
            className="shrink-0 rounded-md px-1 text-ink-400 transition-colors hover:text-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── 2 + 3. pages, publishing ─────────────────────────────────────── */}
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-5">
        <PagesPanel
          pages={pages}
          lastPublishedAt={lastPublishedAt}
          className="min-w-0 lg:col-span-3"
          pagesWithEdits={pagesWithEdits}
        />

        <PublishPanel
          className="min-w-0 lg:col-span-2"
          releases={releases}
          loaded={loaded}
          siteSlug={site.slug}
          notes={notes}
          setNotes={setNotes}
          publishing={busy === "publish"}
          building={building}
          busy={busy}
          onPublish={publish}
          onRestore={restore}
          onRetry={retry}
          confirm={confirm}
          onCancelConfirm={() => setConfirm(null)}
          pagesWithEdits={pagesWithEdits}
          hasPages={pages.length > 0}
          pageCount={pages.length}
          firstTime={loaded && lastPublishedAt === null}
        />
      </div>

      {/* ── 4. take it elsewhere ─────────────────────────────────────────── */}
      <ExportPanel
        className="mt-5"
        siteSlug={site.slug}
        releaseId={exportReleaseId}
        versionNo={live?.versionNo ?? null}
        customDomain={site.customDomain}
        onPublish={publish}
        publishing={busy === "publish"}
        building={building}
      />

      {/* ── 5. the store ─────────────────────────────────────────────────── */}
      <CommercePanel className="mt-5" commerce={commerce} modules={site.modules} />

      {/* ── 6. the internals, on request ─────────────────────────────────── */}
      <div className="mt-5">
        <UnderTheHood>
          <p>
            <strong className="font-medium text-ink-200">Pages hold no content.</strong> A row in{" "}
            <code className="font-mono text-ink-300">pages</code> is identity only — path, title,
            type. The body someone is editing lives in exactly one{" "}
            <code className="font-mono text-ink-300">page_drafts</code> row (page_id is the primary
            key, so &ldquo;one draft per page&rdquo; is a database guarantee), and every published
            body is appended to <code className="font-mono text-ink-300">page_revisions</code> and
            never touched again.
          </p>
          <p>
            <strong className="font-medium text-ink-200">Publishing is a snapshot, not a
            render.</strong> One transaction promotes each draft to a revision and writes{" "}
            <code className="font-mono text-ink-300">release_items</code> pinning exactly which
            revision of which entity belongs to the release, plus{" "}
            <code className="font-mono text-ink-300">release_dependencies</code> recording the live
            records those pages point at. A row in{" "}
            <code className="font-mono text-ink-300">build_jobs</code> is claimed by a separate OS
            process, which renders the artifact to disk — which is why the button returns before
            the site is ready.
          </p>
          <p>
            <strong className="font-medium text-ink-200">Restoring is one column.</strong>{" "}
            <code className="font-mono text-ink-300">
              UPDATE sites SET live_release_id = &lt;older release&gt;
            </code>
            . No file is written, read or copied; the old artifact has been sitting on disk since
            the day it was built. That single column is the only coupling between versioned content
            and what a visitor sees.
          </p>
          <p>
            <strong className="font-medium text-ink-200">The store is deliberately not
            versioned.</strong> <code className="font-mono text-ink-300">products</code>,{" "}
            <code className="font-mono text-ink-300">orders</code> and{" "}
            <code className="font-mono text-ink-300">customers</code> never appear in a release
            manifest, so restoring an old design cannot un-place an order. Deletes are soft, and{" "}
            <code className="font-mono text-ink-300">release_dependencies</code> is read in reverse
            to warn you before a frozen page loses the record it was built with.
          </p>
          <p className="pt-1">
            <a
              className="text-flux-300 underline decoration-flux-300/40 underline-offset-2 hover:decoration-flux-300"
              href="/walkthrough"
            >
              Watch the tables change live in the walkthrough →
            </a>
          </p>
        </UnderTheHood>
      </div>
    </main>
  );
}

/* ── top bar ──────────────────────────────────────────────────────────────── */

function TopBar() {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-300">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-flux-500/15 text-[11px] text-flux-300">
          ◆
        </span>
        Dashboard
      </div>
      <nav className="flex items-center gap-1">
        <LinkBtn href="/dashboard/products" size="sm" variant="quiet">
          Store
        </LinkBtn>
        <LinkBtn href="/walkthrough" size="sm" variant="quiet">
          Walkthrough
        </LinkBtn>
        <LinkBtn href="/" size="sm" variant="quiet">
          Home
        </LinkBtn>
      </nav>
    </div>
  );
}

/* ── 1. hero ──────────────────────────────────────────────────────────────── */

function Hero({
  site,
  live,
  loaded,
  building,
  buildingVersion,
  publishing,
  onPublish,
  editHref,
}: {
  site: DashSite;
  live: ReleaseRow | null;
  loaded: boolean;
  building: boolean;
  buildingVersion: number | null;
  publishing: boolean;
  onPublish: () => void;
  editHref: string;
}) {
  const liveUrl = `/s/${site.slug}`;

  return (
    <Card tone={live && !building ? "live" : "default"} className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_0%_0%,rgba(109,92,255,0.13),transparent_60%)]"
      />
      <div className="relative flex flex-col gap-6 p-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {!loaded ? (
              <Badge tone="neutral">Checking…</Badge>
            ) : building ? (
              <Badge tone="building">
                <Dot tone="building" pulse />
                Publishing…
              </Badge>
            ) : live ? (
              <Badge tone="live">
                <Dot tone="live" />
                Live
              </Badge>
            ) : (
              <Badge tone="warn">Not published yet</Badge>
            )}
            <span className="text-[12px] text-ink-500">{site.orgName}</span>
          </div>

          <h1 className="mt-3 truncate text-[28px] font-semibold tracking-tight text-ink-100 sm:text-[32px]">
            {site.name}
          </h1>

          <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-ink-300">
            {!loaded ? (
              "Looking up the current version of your site…"
            ) : building ? (
              <>
                Building version {buildingVersion ?? "your site"}
                {live ? " — the version people can see right now stays up until it's ready." : " for the first time. This usually takes a few seconds."}
              </>
            ) : live ? (
              <>
                Version {live.versionNo} is online for everyone, published{" "}
                <Ago at={live.createdAt} fallback="recently" />.
              </>
            ) : (
              <>
                Nobody can see this site yet. Publish it once and it gets a real address, a version
                you can return to, and files you can download.
              </>
            )}
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              title="The address your visitors use"
              className="group inline-flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-950/70 px-2.5 py-1 font-mono text-[11.5px] text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400"
            >
              /s/{site.slug}
              <span className="text-ink-500 transition-colors group-hover:text-flux-300">↗</span>
            </a>
            {site.customDomain && (
              <a
                href={`/?host=${site.customDomain}`}
                title="Your custom domain. Requests are matched on the Host header against sites.custom_domain."
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-950/70 px-2.5 py-1 font-mono text-[11.5px] text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400"
              >
                {site.customDomain}
              </a>
            )}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-[212px]">
          {!live ? (
            <>
              <Btn variant="primary" onClick={onPublish} disabled={publishing || building || !loaded}>
                {publishing || building ? "Publishing…" : "Publish for the first time"}
              </Btn>
              <LinkBtn href={editHref} variant="ghost">
                Edit your pages
              </LinkBtn>
            </>
          ) : (
            <>
              <LinkBtn href={liveUrl} external variant="primary" title="Opens your published site">
                View live site ↗
              </LinkBtn>
              <LinkBtn href={editHref} variant="secondary" title="Opens the visual page editor">
                Edit
              </LinkBtn>
            </>
          )}
        </div>
      </div>

      {building && <BuildingStrip />}
    </Card>
  );
}

/** A calm, non-alarming progress line. Reduced motion turns the sweep off. */
function BuildingStrip() {
  return (
    <div className="relative h-[3px] w-full overflow-hidden bg-ink-800">
      <div className="cms-build-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-flux-400 to-transparent" />
      <style>{`
        @keyframes cms-build-sweep { 0% { transform: translateX(-100%);} 100% { transform: translateX(400%);} }
        .cms-build-sweep { animation: cms-build-sweep 1.5s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cms-build-sweep { animation: none; width: 100%; opacity: .5; }
        }
      `}</style>
    </div>
  );
}

/* ── 2. pages ─────────────────────────────────────────────────────────────── */

function PagesPanel({
  pages,
  lastPublishedAt,
  pagesWithEdits,
  className,
}: {
  pages: DashPage[];
  lastPublishedAt: string | null;
  pagesWithEdits: number;
  className?: string;
}) {
  return (
    <Card className={cx("p-5 sm:p-6", className)}>
      <CardHead
        title="Pages"
        hint={
          pagesWithEdits > 0
            ? `${pagesWithEdits} page${pagesWithEdits === 1 ? " has" : "s have"} changes that aren't published yet.`
            : "Click a page to open it in the editor."
        }
        tables="pages · page_drafts · page_revisions"
      />

      {pages.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-ink-700 px-4 py-6 text-center text-[12.5px] text-ink-400">
          This site has no pages yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {pages.map((page) => {
            const unpublished =
              page.draftUpdatedAt &&
              lastPublishedAt &&
              new Date(page.draftUpdatedAt).getTime() > new Date(lastPublishedAt).getTime();
            return (
              <li key={page.id}>
                <a
                  href={`/editor/${page.id}`}
                  className="group flex items-center gap-3.5 rounded-xl border border-ink-800 bg-ink-950/60 px-3.5 py-3 transition-colors hover:border-flux-500/40 hover:bg-ink-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400"
                >
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-ink-800 bg-ink-900 text-ink-500 transition-colors group-hover:border-flux-500/30 group-hover:text-flux-300"
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <path d="M4 2h5l3 3v9H4z" />
                      <path d="M9 2v3h3" />
                    </svg>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-[13.5px] font-medium text-ink-100">
                        {page.title}
                      </span>
                      <code className="truncate font-mono text-[11px] text-ink-500">
                        {page.path}
                      </code>
                    </span>
                    <span
                      className="mt-0.5 block text-[11.5px] leading-snug text-ink-400"
                      title={
                        page.lockVersion !== null
                          ? `page_revisions: ${page.revisionCount} rows · page_drafts.lock_version ${page.lockVersion}`
                          : `page_revisions: ${page.revisionCount} rows · no draft row yet`
                      }
                    >
                      {page.revisionCount === 0
                        ? "Never published"
                        : `Published ${page.revisionCount} time${page.revisionCount === 1 ? "" : "s"}`}
                      {page.draftUpdatedAt && (
                        <>
                          {" · edited "}
                          <Ago at={page.draftUpdatedAt} fallback="recently" />
                        </>
                      )}
                    </span>
                  </span>

                  {unpublished && (
                    <Badge tone="warn" className="hidden shrink-0 sm:inline-flex">
                      Unpublished edits
                    </Badge>
                  )}

                  <span className="shrink-0 text-[12px] text-ink-500 transition-colors group-hover:text-flux-300">
                    Edit →
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ── 3. publish & history ─────────────────────────────────────────────────── */

function PublishPanel({
  releases,
  loaded,
  siteSlug,
  notes,
  setNotes,
  publishing,
  building,
  busy,
  onPublish,
  onRestore,
  onRetry,
  confirm,
  onCancelConfirm,
  pagesWithEdits,
  hasPages,
  pageCount,
  firstTime,
  className,
}: {
  releases: ReleaseRow[] | null;
  loaded: boolean;
  siteSlug: string;
  notes: string;
  setNotes: (v: string) => void;
  publishing: boolean;
  building: boolean;
  busy: string | null;
  onPublish: () => void;
  onRestore: (releaseId: string, versionNo: number, acknowledge?: boolean) => void;
  onRetry: (releaseId: string) => void;
  confirm: {
    releaseId: string;
    versionNo: number;
    warnings: DependencyWarning[];
    message: string;
  } | null;
  onCancelConfirm: () => void;
  pagesWithEdits: number;
  hasPages: boolean;
  pageCount: number;
  firstTime: boolean;
  className?: string;
}) {
  const list = releases ?? [];

  return (
    <Card className={cx("flex flex-col p-5 sm:p-6", className)}>
      <CardHead
        title="Publish"
        hint="Takes everything as it stands right now and makes it the version visitors see."
      />

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What changed? (optional)"
          aria-label="Note describing this version (optional)"
          className="h-10 min-w-0 flex-1 rounded-xl border border-ink-700 bg-ink-950 px-3 text-[13px] text-ink-100 placeholder:text-ink-500 outline-none transition-colors focus:border-flux-500 focus-visible:ring-2 focus-visible:ring-flux-400/40"
        />
        <Btn variant="primary" onClick={onPublish} disabled={publishing || building || !hasPages}>
          {publishing ? "Starting…" : building ? "Publishing…" : "Publish changes"}
        </Btn>
      </div>

      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">
        {building
          ? "Building your site. This usually takes a few seconds — the current version stays live until it's done."
          : firstTime
            ? `Your first version will include all ${pageCount} page${pageCount === 1 ? "" : "s"}.`
            : pagesWithEdits > 0
              ? `${pagesWithEdits} page${pagesWithEdits === 1 ? "" : "s"} changed since the last version.`
              : "Nothing has changed since the last version."}
      </p>

      {confirm && (
        <div className="mt-4 rounded-xl border border-warn-500/40 bg-warn-500/[0.08] p-4">
          <div className="flex items-center gap-2 text-[13px] font-medium text-warn-500">
            <Dot tone="warn" />
            Before you restore version {confirm.versionNo}
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">
            That version was built when {confirm.warnings.length} thing
            {confirm.warnings.length === 1 ? "" : "s"} still existed in your store. It will still
            load, but you&apos;ll see a placeholder where {confirm.warnings.length === 1 ? "it was" : "they were"}:
          </p>
          <ul className="mt-2 space-y-1">
            {confirm.warnings.map((w) => (
              <li key={`${w.refType}:${w.refId}`} className="text-[12px] text-ink-300">
                <span className="text-ink-100">{w.label}</span>{" "}
                <span className="text-warn-500">
                  ({w.status === "deleted" ? "removed" : "no longer exists"})
                </span>{" "}
                <span className="font-mono text-[10.5px] text-ink-500">{w.refType}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500" title={confirm.message}>
            Nothing is deleted by restoring — you can move back to the newest version at any time.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn
              variant="danger"
              size="sm"
              aria-label="Restore anyway (roll back anyway)"
              onClick={() => onRestore(confirm.releaseId, confirm.versionNo, true)}
            >
              Restore anyway
            </Btn>
            <Btn variant="ghost" size="sm" onClick={onCancelConfirm}>
              Keep current version
            </Btn>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-ink-200">Version history</h3>
        <code
          title="Backed by the releases and release_items tables"
          className="font-mono text-[10.5px] text-ink-500"
        >
          releases
        </code>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
        Every version is kept. Restoring one puts it back online instantly.
      </p>

      {!loaded ? (
        <ul className="mt-3 space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-[74px] animate-pulse rounded-xl border border-ink-800 bg-ink-950/60" />
          ))}
        </ul>
      ) : list.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-ink-700 px-4 py-6 text-center">
          <p className="text-[12.5px] text-ink-300">No versions yet.</p>
          <p className="mt-1 text-[11.5px] text-ink-500">
            Your first publish creates version 1, and every one after it stays here to return to.
          </p>
        </div>
      ) : (
        <ol className="mt-3 space-y-2">
          {list.map((r) => (
            <ReleaseCard
              key={r.id}
              release={r}
              siteSlug={siteSlug}
              busy={busy === r.id}
              onRestore={onRestore}
              onRetry={onRetry}
            />
          ))}
        </ol>
      )}
    </Card>
  );
}

function ReleaseCard({
  release: r,
  siteSlug,
  busy,
  onRestore,
  onRetry,
}: {
  release: ReleaseRow;
  siteSlug: string;
  busy: boolean;
  onRestore: (releaseId: string, versionNo: number, acknowledge?: boolean) => void;
  onRetry: (releaseId: string) => void;
}) {
  return (
    <li
      className={cx(
        "rounded-xl border p-3.5 transition-colors",
        r.isLive ? "border-live-500/30 bg-live-500/[0.06]" : "border-ink-800 bg-ink-950/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[13px] font-semibold text-ink-100">Version {r.versionNo}</span>
        {r.isLive ? (
          <Badge tone="live">
            <Dot tone="live" />
            Currently live
          </Badge>
        ) : r.status === "building" ? (
          <Badge tone="building">
            <Dot tone="building" pulse />
            Publishing…
          </Badge>
        ) : r.status === "failed" ? (
          <Badge tone="failed">Didn&apos;t build</Badge>
        ) : (
          <Badge tone="neutral">Saved</Badge>
        )}
        <span className="ml-auto text-[11px] text-ink-500" title={exactTime(r.createdAt)}>
          <Ago at={r.createdAt} fallback="" />
        </span>
      </div>

      {r.notes && <p className="mt-1.5 text-[12px] italic text-ink-300">“{r.notes}”</p>}

      <p
        className="mt-1.5 text-[11.5px] text-ink-500"
        title={`release_items: ${r.itemCount} rows · release_dependencies: ${r.dependencyCount} rows · id ${r.id}`}
      >
        {r.itemCount} page{r.itemCount === 1 ? "" : "s"} captured
        {r.dependencyCount > 0 && ` · ${r.dependencyCount} store item${r.dependencyCount === 1 ? "" : "s"} referenced`}
      </p>

      {r.buildError && (
        <p className="mt-2 rounded-lg bg-fail-500/10 px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed text-fail-500">
          {r.buildError}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {r.status === "ready" && !r.isLive && (
          <Btn
            variant="secondary"
            size="xs"
            disabled={busy}
            aria-label={`Restore version ${r.versionNo} (roll back to this version)`}
            onClick={() => onRestore(r.id, r.versionNo)}
          >
            {busy ? "Restoring…" : "Restore"}
          </Btn>
        )}
        {r.status === "failed" && (
          <Btn variant="ghost" size="xs" disabled={busy} onClick={() => onRetry(r.id)}>
            Try building again
          </Btn>
        )}
        {r.status === "ready" && (
          <>
            {r.isLive && (
              <LinkBtn
                href={`/s/${siteSlug}`}
                external
                size="xs"
                variant="quiet"
                title="Open the hosted site"
              >
                Open ↗
              </LinkBtn>
            )}
            <LinkBtn
              href={`/api/releases/${r.id}/export/static`}
              download
              size="xs"
              variant="quiet"
              title="Download this exact version as a .zip of static files"
            >
              .zip
            </LinkBtn>
            <LinkBtn
              href={`/api/releases/${r.id}/export/container`}
              download
              size="xs"
              variant="quiet"
              title="Download this exact version as an nginx container bundle"
            >
              Container
            </LinkBtn>
          </>
        )}
      </div>
    </li>
  );
}

/* ── 4. exports ───────────────────────────────────────────────────────────── */

function ExportPanel({
  siteSlug,
  releaseId,
  versionNo,
  customDomain,
  onPublish,
  publishing,
  building,
  className,
}: {
  siteSlug: string;
  releaseId: string | null;
  versionNo: number | null;
  customDomain: string | null;
  onPublish: () => void;
  publishing: boolean;
  building: boolean;
  className?: string;
}) {
  return (
    <Card className={cx("p-5 sm:p-6", className)}>
      <CardHead
        title="Take your site elsewhere"
        hint={
          releaseId
            ? `Three ways to get the same site${versionNo ? ` — all of them version ${versionNo}` : ""}. Nothing here locks you in.`
            : "Once you publish, you can open, download or self-host your site from here."
        }
        tables="releases.artifact_url"
      />

      {!releaseId ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-dashed border-ink-700 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12.5px] text-ink-400">
            There are no files yet — a version has to be built first.
          </p>
          <Btn variant="secondary" size="sm" onClick={onPublish} disabled={publishing || building}>
            {building ? "Publishing…" : "Publish now"}
          </Btn>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ExportCard
              title="Open it here"
              detail="Your site, served from this app. The address you'd hand to anyone."
              cta="Open site ↗"
              href={`/s/${siteSlug}`}
              external
              tech="Static files read from disk, never re-rendered per request."
            />
            <ExportCard
              title="Download a .zip"
              detail="Plain HTML and CSS. Put it on any static host, or just open it from your desktop."
              cta="Download .zip"
              href={`/api/releases/${releaseId}/export/static`}
              tech="The build output copied verbatim; it runs from file:// with no server."
            />
            <ExportCard
              title="Run it yourself"
              detail="A ready-to-run container: nginx, a Dockerfile and a compose file."
              cta="Download bundle"
              href={`/api/releases/${releaseId}/export/container`}
              tech="Same artifact, wrapped for `docker compose up`."
            />
          </div>

          {customDomain && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">
              Your custom domain{" "}
              <a
                href={`/?host=${customDomain}`}
                className="font-mono text-ink-300 underline decoration-ink-600 underline-offset-2 hover:text-flux-300"
                title="Requests are matched on the Host header against sites.custom_domain"
              >
                {customDomain}
              </a>{" "}
              serves these same files. Only DNS and SSL are outside this demo.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function ExportCard({
  title,
  detail,
  cta,
  href,
  external,
  tech,
}: {
  title: string;
  detail: string;
  cta: string;
  href: string;
  external?: boolean;
  tech: string;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      title={tech}
      className="group flex flex-col rounded-xl border border-ink-800 bg-ink-950/60 p-4 transition-colors hover:border-flux-500/40 hover:bg-ink-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400"
    >
      <div className="text-[13.5px] font-medium text-ink-100">{title}</div>
      <p className="mt-1 flex-1 text-[12px] leading-relaxed text-ink-400">{detail}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-flux-300 transition-transform duration-150 group-hover:translate-x-0.5">
        {cta}
      </span>
    </a>
  );
}

/* ── 5. commerce ──────────────────────────────────────────────────────────── */

function CommercePanel({
  commerce,
  modules,
  className,
}: {
  commerce: DashCommerce;
  modules: string[];
  className?: string;
}) {
  return (
    <Card className={cx("p-5 sm:p-6", className)}>
      <CardHead
        title="Store"
        hint="Products, prices and orders. This data is live: it isn't part of a version, and restoring an older design never touches it."
        tables="products · orders"
        action={
          <LinkBtn href="/dashboard/products" size="sm" variant="secondary">
            Manage store →
          </LinkBtn>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Products"
          value={commerce.productCount}
          sub="on sale now"
          href="/dashboard/products"
          title="products (deleted_at is null)"
        />
        <Tile
          label="Orders"
          value={commerce.orderCount}
          sub="all time"
          href="/dashboard/products"
          title="orders"
        />
        <Tile
          label="Revenue"
          value={money(commerce.revenueCents)}
          sub="all time"
          title="sum of orders.total_cents"
        />
        <Tile
          label="Features on"
          value={modules.length ? modules.map(capitalise).join(", ") : "Core"}
          sub={modules.length ? "beyond the core builder" : "no add-ons enabled"}
          title="site_modules"
        />
      </div>
    </Card>
  );
}
