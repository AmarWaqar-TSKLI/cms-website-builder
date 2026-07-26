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
import { useRouter } from "next/navigation";
import { Badge, Dot, cx } from "../ui";
import { Ago } from "./Ago";
import { AccountBar } from "./AccountBar";
import { ActivityFeed } from "./ActivityFeed";
import { NextStep } from "./NextStep";
import { Welcome } from "./Welcome";
import {
  Btn,
  Card,
  CardHead,
  LinkBtn,
  TechnicalDetails,
  Tile,
  useTechnical,
  UnderTheHood,
  exactTime,
  money,
} from "./dash-ui";

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

/** How much history to show before asking. */
const VISIBLE_VERSIONS = 4;

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ── shell ────────────────────────────────────────────────────────────────── */

export interface DashUser {
  id: string;
  name: string;
  email: string;
}

export interface DashActivity {
  id: string;
  actorName: string;
  summary: string;
  action: string;
  createdAt: string;
}

export interface DashLock {
  pageId: string;
  path: string;
  name: string;
  isMine: boolean;
}

export function DashboardShell({
  site,
  pages,
  commerce,
  user,
  sites,
  activity,
  locks,
}: {
  site: DashSite;
  pages: DashPage[];
  commerce: DashCommerce;
  user: DashUser;
  sites: { id: string; name: string; slug: string }[];
  activity: DashActivity[];
  locks: DashLock[];
}) {
  const lockFor = (pageId: string) => locks.find((l) => l.pageId === pageId);
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

  const router = useRouter();

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

  /* Page counts and draft timestamps are rendered on the server, so a finished
     publish has to ask for fresh ones. */
  const refreshServerData = useCallback(() => router.refresh(), [router]);

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
          refreshServerData();
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
  }, [watching, load, refreshServerData]);

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

  /**
   * Technical details, off by default and remembered per browser.
   *
   * Read in an effect rather than during render so the server and the first
   * client paint agree — reading localStorage while rendering is the classic
   * way to get a hydration mismatch.
   */
  const [technical, setTechnical] = useState(false);
  useEffect(() => {
    setTechnical(window.localStorage.getItem("cms.technical") === "1");
  }, []);
  useEffect(() => {
    window.localStorage.setItem("cms.technical", technical ? "1" : "0");
  }, [technical]);

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

  /**
   * The one thing to suggest. Derived, not stored — a "you have unsaved work"
   * flag would be another thing that can be wrong, and everything needed to work
   * it out is already on screen.
   */
  const nextStep: "never-published" | "has-changes" | "up-to-date" | "building" = building
    ? "building"
    : !live
      ? "never-published"
      : pagesWithEdits > 0
        ? "has-changes"
        : "up-to-date";

  return (
    <TechnicalDetails enabled={technical}>
      {/* First-run orientation. Shows itself once per user, then hands off to the
          "Start here" card below; reopenable from the top bar. */}
      <Welcome userId={user.id} userName={user.name} siteName={site.name} editHref={editHref} />
      <AccountBar
        user={user}
        sites={sites}
        currentSiteId={site.id}
        technical={technical}
        onTechnicalChange={setTechnical}
      />
      <main className="mx-auto min-h-screen w-full max-w-[1140px] px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
      <TopBar />

      {/* Who is in the building. Only shown when it is somebody else — telling
          you that you are editing your own page is noise. */}
      {locks.some((l) => !l.isMine) && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-warn-500/25 bg-warn-500/[0.07] px-4 py-2.5">
          <span className="text-[12px]">✎</span>
          {locks
            .filter((l) => !l.isMine)
            .map((l) => (
              <span key={l.pageId} className="text-[12.5px] text-warn-500">
                <strong className="font-semibold">{l.name}</strong> is editing{" "}
                <code className="font-mono">{l.path}</code>
              </span>
            ))}
        </div>
      )}

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

      <div className="mb-6">
        <NextStep
          state={nextStep}
          pageCount={pages.length}
          pendingCount={pagesWithEdits}
          editHref={editHref}
          onPublish={publish}
          publishing={busy === "publish"}
        />
      </div>

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
      {/* ── Who did what ─────────────────────────────────────────────────── */}
      <Card className="mt-6 p-5 sm:p-6">
        <CardHead
          title="Recent activity"
          hint="Who changed what, and when."
          tables="activity_log"
        />
        <div className="mt-4">
          <ActivityFeed activity={activity} />
        </div>
      </Card>
    </main>
    </TechnicalDetails>
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
        <Btn
          size="sm"
          variant="quiet"
          onClick={() => window.dispatchEvent(new Event("cms:show-welcome"))}
          title="Replay the quick intro to how this works"
        >
          Show intro
        </Btn>
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

          <h1 className="display mt-3 truncate text-[30px] text-ink-100 sm:text-[36px]">
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
                Nobody can see this website yet. Publishing gives it a real web address and saves
                this exact version, so you can always come back to it.
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

        <div className="flex w-full shrink-0 flex-col gap-2 self-stretch sm:w-[240px] sm:self-start lg:self-center">
          {!live ? (
            // Deliberately no publish button here. The "Start here" card below
            // owns that action, and two primary buttons for one job make a
            // person stop to work out whether they differ.
            <LinkBtn href={editHref} variant="primary">
              Edit your pages
            </LinkBtn>
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
            : "Click any page to change what is on it."
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
                    <span className="hidden shrink-0 sm:block">
                      <Badge tone="warn">Unpublished edits</Badge>
                    </span>
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

      <p className="mt-4 border-t border-ink-800 pt-3.5 text-[11.5px] leading-relaxed text-ink-500">
        Editing never changes your live website. Your work saves privately as you go, and only
        becomes public when you publish.{" "}
        <a
          href="/walkthrough"
          className="text-flux-300 underline decoration-flux-300/40 underline-offset-2 transition-colors hover:decoration-flux-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400"
        >
          Watch that happen →
        </a>
      </p>
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
  const technical = useTechnical();
  const [showAll, setShowAll] = useState(false);
  const list = releases ?? [];
  const visible = showAll ? list : list.slice(0, VISIBLE_VERSIONS);

  return (
    <Card className={cx("flex flex-col p-5 sm:p-6", className)}>
      <CardHead
        title="Publish"
        hint="Makes everything you have changed visible to the public."
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
            Version {confirm.versionNo} was built while{" "}
            {confirm.warnings.length === 1 ? "something" : `${confirm.warnings.length} things`} in
            your store still existed. The page still loads — you&apos;ll just see a placeholder
            where {confirm.warnings.length === 1 ? "it was" : "they were"}:
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
        <h3 className="text-[13px] font-semibold text-ink-200">Earlier versions</h3>
        {technical && (
          <code
            title="Stored in the releases and release_items tables"
            className="rounded-md bg-ink-850 px-2 py-1 font-mono text-[10.5px] text-ink-500"
          >
            releases
          </code>
        )}
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
        Every time you publish we keep a copy, so you can put an older one back whenever you like.
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
            Once you publish, older versions of your website live here — so a mistake is never permanent.
          </p>
        </div>
      ) : (
        <>
          <ol className="mt-3 space-y-2">
            {visible.map((r) => (
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
          {list.length > VISIBLE_VERSIONS && (
            <Btn
              variant="quiet"
              size="sm"
              className="mt-2 self-start"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? "Show fewer versions"
                : `Show all ${list.length} versions (${list.length - VISIBLE_VERSIONS} older)`}
            </Btn>
          )}
        </>
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
          <Badge tone="neutral">Not live</Badge>
        )}
        <span className="ml-auto text-[11px] text-ink-500" title={exactTime(r.createdAt)}>
          <Ago at={r.createdAt} fallback="" />
        </span>
      </div>

      {r.notes && <p className="mt-1.5 text-[12px] italic text-ink-300">“{r.notes}”</p>}

      <p
        className="mt-1.5 text-[11.5px] text-ink-500"
        title={`${r.itemCount} pinned revisions (release_items) · ${r.dependencyCount} live records referenced (release_dependencies) · release ${r.id}`}
      >
        Your whole site, exactly as it was
        {r.dependencyCount > 0 && ` · uses ${r.dependencyCount} store record${r.dependencyCount === 1 ? "" : "s"}`}
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
        title="Download your website"
        hint={
          releaseId
            ? `Three ways to get the same site${versionNo ? ` — all of them version ${versionNo}` : ""}. Nothing here locks you in.`
            : "Your website is yours. Once published you can download the whole thing as files, or move it to another host."
        }
        tables="releases.artifact_url"
      />

      {!releaseId ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-dashed border-ink-700 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12.5px] text-ink-400">
            Nothing to download yet. Publish once and the files appear here.
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
        hint="Your products, prices and orders. These are always live — changing your design, or going back to an older version, never touches them."
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
          label="Selling"
          value={modules.length ? "On" : "Off"}
          sub={modules.length ? "you can list and sell products" : "pages only, no shop"}
          title="site_modules"
        />
      </div>
    </Card>
  );
}
