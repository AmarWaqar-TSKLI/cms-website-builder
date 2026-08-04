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
import { SiteSidebar } from "./SiteSidebar";
import { ActivityFeed } from "./ActivityFeed";
import { CustomDomainCard } from "./CustomDomainCard";
import { ContentApiCard } from "./ContentApiCard";
import { LOCALES } from "@/lib/locales";
import { NextStep } from "./NextStep";
import { SetupChecklist, type SetupStep } from "./SetupChecklist";
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
  /** Set when this site is a branch of another; enables the compare + merge UI. */
  parentSiteId: string | null;
  parentName: string | null;
}

/** The three-way diff and merge shapes come straight from the lib (type-only —
 * erased at build, so no server code reaches the client bundle). */
import type { BranchDiff, MergeResult } from "@/lib/branch";

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

/** Languages offered by AI Translate — one source of truth in lib/locales. */
const TRANSLATE_LOCALES = LOCALES;

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

/** One AI-proposed brand concept (mirrors BrandDirection in lib/ai). */
interface BrandDirection {
  name: string;
  vibe: string;
  sampleHeadline: string;
  tokens: { colorBg: string; colorFg: string; colorAccent: string; colorSurface: string };
}

/**
 * The site's display name, editable in place. Click the pencil (or the name),
 * type, press Enter — it PATCHes /api/sites/:id and refreshes so the new name
 * shows here, in the switcher and in the editor. The slug never changes, so no
 * existing link breaks.
 */
function SiteTitle({ siteId, name }: { siteId: string; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow the server value after a refresh (or a rename elsewhere).
  useEffect(() => setValue(name), [name]);

  const cancel = useCallback(() => {
    setEditing(false);
    setValue(name);
    setError(null);
  }, [name]);

  const save = useCallback(async () => {
    const next = value.trim().slice(0, 60);
    if (!next || next === name) {
      cancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Couldn't rename the site.");
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't rename the site.");
    } finally {
      setSaving(false);
    }
  }, [value, name, siteId, cancel, router]);

  if (editing) {
    return (
      <div className="mt-3">
        <input
          autoFocus
          value={value}
          maxLength={60}
          disabled={saving}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            } else if (e.key === "Escape") {
              cancel();
            }
          }}
          onBlur={() => void save()}
          aria-label="Site name"
          className="display w-full max-w-[22ch] rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1 text-[30px] text-ink-100 outline-none focus:border-flux-400 disabled:opacity-60 sm:text-[36px]"
        />
        {error ? <span className="mt-1 block text-[12px] text-red-400">{error}</span> : null}
      </div>
    );
  }

  return (
    <h1 className="display group mt-3 flex items-center gap-2 text-[30px] text-ink-100 sm:text-[36px]">
      <span className="truncate">{name}</span>
      <button
        type="button"
        onClick={() => {
          setValue(name);
          setEditing(true);
        }}
        title="Rename this site"
        aria-label="Rename this site"
        className="shrink-0 rounded-md p-1.5 text-ink-500 opacity-0 transition hover:bg-ink-800 hover:text-ink-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400 group-hover:opacity-100"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      </button>
    </h1>
  );
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
  const [rebrandVibe, setRebrandVibe] = useState("");
  const [directions, setDirections] = useState<BrandDirection[] | null>(null);
  const [diff, setDiff] = useState<BranchDiff | null>(null);
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set());
  /** Structural picks, prefix-keyed: an:/rn: nodes, as:/rs: sections, ap:/rp: pages. */
  const [structSel, setStructSel] = useState<Set<string>>(new Set());
  const [mergeTheme, setMergeTheme] = useState(true);
  const [merged, setMerged] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [translateSel, setTranslateSel] = useState<Set<string>>(new Set());
  const [translated, setTranslated] = useState<string[]>([]);

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

  // AI rebrand: rewrite all copy + restyle the theme, publish as one release,
  // then watch it build via the same mechanism a normal publish uses.
  const runRebrand = useCallback(
    async (instruction: string) => {
      if (instruction.trim().length < 3) return;
      setBusy("rebrand");
      setFlash(null);
      setDirections(null);
      try {
        const res = await fetch(`/api/sites/${site.id}/ai-rebrand`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction: instruction.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setFlash({ kind: "error", text: data.error ?? "The rebrand didn't go through." });
          return;
        }
        setRebrandVibe("");
        setFlash({
          kind: "info",
          text: `Rebranded — rewrote ${data.fieldsRewritten} text field${
            data.fieldsRewritten === 1 ? "" : "s"
          }${data.themeChanged ? " and a fresh palette" : ""}. Publishing v${data.versionNo}…`,
        });
        setWatching({ releaseId: data.releaseId, versionNo: data.versionNo });
        await load();
      } catch {
        setFlash({ kind: "error", text: "Could not reach the server. Check your connection." });
      } finally {
        setBusy(null);
      }
    },
    [site.id, load],
  );

  const rebrand = useCallback(() => void runRebrand(rebrandVibe), [runRebrand, rebrandVibe]);

  // "Give me 3 directions" — ask for three brand concepts to pick from before
  // committing. Picking one runs runRebrand with that concept's vibe.
  const getDirections = useCallback(async () => {
    setBusy("directions");
    setFlash(null);
    try {
      const res = await fetch(`/api/sites/${site.id}/ai-directions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlash({ kind: "error", text: data.error ?? "Couldn't get directions." });
        return;
      }
      setDirections(Array.isArray(data.directions) ? data.directions : []);
    } catch {
      setFlash({ kind: "error", text: "Could not reach the server. Check your connection." });
    } finally {
      setBusy(null);
    }
  }, [site.id]);

  // AI translate: build translated locale pages, publish as one release, watch it.
  const runTranslate = useCallback(async () => {
    const codes = [...translateSel];
    if (!codes.length) return;
    setBusy("translate");
    setFlash(null);
    try {
      const res = await fetch(`/api/sites/${site.id}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locales: codes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlash({ kind: "error", text: data.error ?? "The translation didn't go through." });
        return;
      }
      const created: string[] = data.localesCreated ?? [];
      setTranslated(created);
      setTranslateSel(new Set());
      setFlash({
        kind: "info",
        text: created.length
          ? `Translated into ${created.length} language${created.length === 1 ? "" : "s"} (${data.pagesCreated} page${data.pagesCreated === 1 ? "" : "s"}, ${data.fieldsTranslated} fields). Publishing v${data.versionNo}…`
          : `Nothing new to translate${data.localesSkipped?.length ? ` — ${data.localesSkipped.join(", ")} already exist.` : "."}`,
      });
      if (data.releaseId) setWatching({ releaseId: data.releaseId, versionNo: data.versionNo });
      await load();
    } catch {
      setFlash({ kind: "error", text: "Could not reach the server. Check your connection." });
    } finally {
      setBusy(null);
    }
  }, [site.id, translateSel, load]);

  // ── Branches ───────────────────────────────────────────────────────────────
  const branchSite = useCallback(async () => {
    setBusy("branch");
    setFlash(null);
    try {
      const res = await fetch(`/api/sites/${site.id}/branch`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlash({ kind: "error", text: data.error ?? "Couldn't branch the site." });
        return;
      }
      router.push(`/dashboard?site=${data.id}`);
    } catch {
      setFlash({ kind: "error", text: "Could not reach the server. Check your connection." });
    } finally {
      setBusy(null);
    }
  }, [site.id, router]);

  const loadDiff = useCallback(async () => {
    setBusy("diff");
    setFlash(null);
    try {
      const res = await fetch(`/api/sites/${site.id}/branch-diff`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlash({ kind: "error", text: data.error ?? "Couldn't compute the diff." });
        return;
      }
      const d = data as BranchDiff;
      setDiff(d);
      // Safe defaults, mirroring the server's: clean changes and additions
      // ticked; conflicts and removals never ticked without a human.
      setMergeSel(new Set(d.changed.filter((c) => !c.conflict).map((c) => c.nodeId)));
      setStructSel(
        new Set([
          ...d.addedNodes.map((a) => `an:${a.nodeId}`),
          ...d.sectionsAdded.map((s) => `as:${s.branchComponentId}`),
          ...d.pagesAdded.map((p) => `ap:${p.path}`),
        ]),
      );
      setMergeTheme(d.theme.some((t) => !t.conflict));
    } catch {
      setFlash({ kind: "error", text: "Could not reach the server. Check your connection." });
    } finally {
      setBusy(null);
    }
  }, [site.id]);

  const mergeToParent = useCallback(async () => {
    setBusy("merge");
    setFlash(null);
    try {
      const picked = (prefix: string) =>
        [...structSel].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
      const res = await fetch(`/api/sites/${site.id}/branch-merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeIds: [...mergeSel],
          addNodeIds: picked("an:"),
          removeNodeIds: picked("rn:"),
          addSectionIds: picked("as:"),
          removeSectionIds: picked("rs:"),
          addPagePaths: picked("ap:"),
          removePagePaths: picked("rp:"),
          includeTheme: mergeTheme,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as MergeResult & { error?: string };
      if (!res.ok) {
        setFlash({ kind: "error", text: data.error ?? "Couldn't merge the branch." });
        return;
      }
      setDiff(null);
      setMerged(true);
      const bits = [
        data.blocksMerged && `${data.blocksMerged} edit${data.blocksMerged === 1 ? "" : "s"}`,
        data.nodesAdded + data.sectionsAdded > 0 &&
          `${data.nodesAdded + data.sectionsAdded} section${
            data.nodesAdded + data.sectionsAdded === 1 ? "" : "s"
          } added`,
        data.nodesRemoved + data.sectionsRemoved > 0 &&
          `${data.nodesRemoved + data.sectionsRemoved} removed`,
        data.pagesAdded > 0 && `${data.pagesAdded} page${data.pagesAdded === 1 ? "" : "s"} added`,
        data.pagesRemoved > 0 && `${data.pagesRemoved} page${data.pagesRemoved === 1 ? "" : "s"} removed`,
        data.themeMerged && "theme",
      ].filter(Boolean);
      setFlash({
        kind: "info",
        text: `Merged ${bits.length ? bits.join(", ") : "nothing"} into ${
          site.parentName ?? "the parent"
        }${data.versionNo ? ` — published v${data.versionNo}` : ""}${
          data.conflictsSkipped
            ? `. ${data.conflictsSkipped} conflicted change${
                data.conflictsSkipped === 1 ? "" : "s"
              } left untouched.`
            : "."
        }`,
      });
    } catch {
      setFlash({ kind: "error", text: "Could not reach the server. Check your connection." });
    } finally {
      setBusy(null);
    }
  }, [site.id, site.parentName, mergeSel, structSel, mergeTheme]);

  /** After a merge the branch has served its purpose — offer to archive it. */
  const archiveBranch = useCallback(async () => {
    setBusy("archive");
    try {
      const res = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/sites");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setFlash({ kind: "error", text: data.error ?? "Couldn't archive the branch." });
    } catch {
      setFlash({ kind: "error", text: "Could not reach the server. Check your connection." });
    } finally {
      setBusy(null);
    }
  }, [site.id, router]);

  const deleteSite = useCallback(async () => {
    setBusy("delete");
    setFlash(null);
    try {
      const res = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFlash({ kind: "error", text: data.error ?? "Couldn't delete the site." });
        return;
      }
      router.push("/sites");
    } catch {
      setFlash({ kind: "error", text: "Could not reach the server. Check your connection." });
    } finally {
      setBusy(null);
    }
  }, [site.id, router]);

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

  /* The setup guide can be dismissed early and stays dismissed per site. Read in
     an effect for the same reason as `technical` — no reading storage in render. */
  const [setupDismissed, setSetupDismissed] = useState(false);
  useEffect(() => {
    setSetupDismissed(window.localStorage.getItem(`cms.setup-dismissed:${site.id}`) === "1");
  }, [site.id]);
  const dismissSetup = useCallback(() => {
    window.localStorage.setItem(`cms.setup-dismissed:${site.id}`, "1");
    setSetupDismissed(true);
  }, [site.id]);

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

  /**
   * The onboarding checklist. Every step's `done` is READ from state we already
   * have — no separate "onboarding progress" table to drift out of sync. The
   * store step only appears when the site actually sells things; a blog-only site
   * never sees it. When every applicable step is done the checklist retires and
   * NextStep takes over.
   */
  const hasCommerce = site.modules.includes("commerce");
  const homepageEdited = pages.some((p) => p.draftUpdatedAt !== null || p.revisionCount > 0);
  const setupSteps: SetupStep[] = [
    {
      id: "edit",
      title: "Make your homepage yours",
      blurb: "Open the editor and change the words, pictures and blocks to match you.",
      done: homepageEdited,
      cta: "Open the editor",
      href: editHref,
    },
    ...(hasCommerce
      ? [
          {
            id: "product",
            title: "Add your first product",
            blurb: "List something to sell — it shows up in your store blocks straight away.",
            done: commerce.productCount > 0,
            cta: "Add a product",
            href: "/dashboard/products",
          } satisfies SetupStep,
        ]
      : []),
    {
      id: "publish",
      title: "Publish your website",
      blurb: "Give it a real web address. This saves the exact version, so you can always come back.",
      done: live !== null,
      cta: "Publish now",
      onClick: publish,
    },
  ];
  const setupComplete = setupSteps.every((s) => s.done);
  // Show the guide only once we know the real release state, so a first paint
  // never flashes "not published" before the poll has answered.
  const showSetup = loaded && !setupComplete && !setupDismissed;

  return (
    <TechnicalDetails enabled={technical}>
      {/* First-run orientation. Shows itself once per user, then hands off to the
          "Start here" card below; reopenable from the top bar. */}
      <Welcome userId={user.id} userName={user.name} siteName={site.name} editHref={editHref} />
      <div className="flex min-h-screen">
        <SiteSidebar
          user={user}
          sites={sites}
          currentSiteId={site.id}
          currentSiteName={site.name}
          modules={site.modules}
          technical={technical}
          onTechnicalChange={setTechnical}
          editHref={editHref}
          liveUrl={site.customDomain ? `https://${site.customDomain}` : `/s/${site.slug}`}
        />
        <main className="min-w-0 flex-1 px-5 pb-20 pt-8 sm:px-8">
          <div className="mx-auto w-full max-w-[1040px]">

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
        {showSetup ? (
          <SetupChecklist steps={setupSteps} onDismiss={dismissSetup} publishing={busy === "publish"} />
        ) : (
          <NextStep
            state={nextStep}
            pageCount={pages.length}
            pendingCount={pagesWithEdits}
            editHref={editHref}
            onPublish={publish}
            publishing={busy === "publish"}
          />
        )}
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

      {/* ── Branches (Git for your site) ─────────────────────────────────── */}
      <section className="mt-5 overflow-hidden rounded-xl border border-ink-800 bg-ink-900 p-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          <span aria-hidden>⑂</span> Branches
        </div>

        {site.parentSiteId ? (
          <>
            <h2 className="display mt-2 text-[20px] text-ink-100">
              This is a branch of {site.parentName ?? "another site"}
            </h2>
            <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-300">
              Redesign it freely — by hand or with AI — without touching what's live. When you're
              happy, review exactly what changed and merge it back as one version.
            </p>
            <p className="mt-1.5 max-w-prose text-[12px] leading-relaxed text-ink-500">
              A branch covers your <b className="text-ink-300">design</b> — pages, copy, theme. The
              store, images and blog are shared with {site.parentName ?? "the parent"}: live data
              isn't branched, so a product added here is added for both.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadDiff()}
                disabled={busy === "diff" || busy === "merge"}
                className="rounded-lg border border-ink-700 px-4 py-2 text-[13px] font-semibold text-ink-100 transition-colors hover:border-ink-500 disabled:opacity-40"
              >
                {busy === "diff" ? "Comparing…" : "Review changes"}
              </button>
              <button
                type="button"
                onClick={() => void mergeToParent()}
                disabled={
                  busy === "merge" ||
                  busy === "diff" ||
                  (!!diff &&
                    mergeSel.size === 0 &&
                    structSel.size === 0 &&
                    !(mergeTheme && diff.theme.length > 0))
                }
                className="rounded-lg bg-flux-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:opacity-40"
              >
                {(() => {
                  if (busy === "merge") return "Merging…";
                  if (!diff) return `Merge into ${site.parentName ?? "parent"} & publish`;
                  const n =
                    mergeSel.size + structSel.size + (mergeTheme && diff.theme.length > 0 ? 1 : 0);
                  return `Merge ${n} change${n === 1 ? "" : "s"} & publish`;
                })()}
              </button>
              {merged ? (
                <button
                  type="button"
                  onClick={() => void archiveBranch()}
                  disabled={busy === "archive"}
                  className="rounded-lg border border-ink-700 px-4 py-2 text-[13px] font-semibold text-ink-300 transition-colors hover:border-fail-500/50 hover:text-fail-500 disabled:opacity-40"
                >
                  {busy === "archive" ? "Archiving…" : "Archive this branch"}
                </button>
              ) : null}
            </div>

            {diff &&
            !diff.changed.length &&
            !diff.theme.length &&
            !diff.addedNodes.length &&
            !diff.removedNodes.length &&
            !diff.sectionsAdded.length &&
            !diff.sectionsRemoved.length &&
            !diff.pagesAdded.length &&
            !diff.pagesRemoved.length ? (
              // The honest empty state. Without it, "0 blocks changed" after
              // adding a product reads as a broken feature instead of the tier
              // split doing its job.
              <div className="mt-4 rounded-xl border border-dashed border-ink-700 bg-ink-950 p-4">
                <p className="text-[13px] text-ink-200">No design changes yet.</p>
                <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-ink-500">
                  This compares the branch's <b className="text-ink-300">design</b> against{" "}
                  {site.parentName ?? "the parent"}: page copy, theme colours and fonts, and pages
                  added or removed. Products, images, orders and blog posts don't appear here — the
                  store is shared with the parent, so those changes are already live on both. Edit
                  some text or restyle the theme on this branch, then compare again.
                </p>
              </div>
            ) : diff ? (
              <div className="mt-4 rounded-xl border border-ink-800 bg-ink-950 p-4">
                <div className="text-[12px] text-ink-300">
                  <b className="text-ink-100">{diff.changed.length}</b> block
                  {diff.changed.length === 1 ? "" : "s"} changed
                  {diff.theme.length ? (
                    <>
                      {" · "}
                      <b className="text-ink-100">{diff.theme.length}</b> theme change
                      {diff.theme.length === 1 ? "" : "s"}
                    </>
                  ) : null}
                  {diff.sectionsAdded.length + diff.addedNodes.length > 0 ? (
                    <> · {diff.sectionsAdded.length + diff.addedNodes.length} added</>
                  ) : null}
                  {diff.sectionsRemoved.length + diff.removedNodes.length > 0 ? (
                    <> · {diff.sectionsRemoved.length + diff.removedNodes.length} removed</>
                  ) : null}
                  {diff.pagesAdded.length + diff.pagesRemoved.length > 0 ? (
                    <> · {diff.pagesAdded.length + diff.pagesRemoved.length} page{diff.pagesAdded.length + diff.pagesRemoved.length === 1 ? "" : "s"}</>
                  ) : null}
                  {diff.conflictCount > 0 ? (
                    <span className="text-amber-400">
                      {" · "}
                      {diff.conflictCount} conflict{diff.conflictCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {!diff.threeWay ? (
                    <span className="text-ink-500"> · forked before conflict tracking — two-way compare</span>
                  ) : null}
                </div>

                {diff.theme.length ? (
                  <label className="mt-3 flex cursor-pointer flex-wrap items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={mergeTheme}
                      onChange={(e) => setMergeTheme(e.target.checked)}
                      className="accent-flux-500"
                    />
                    <span className="mr-1 text-[11px] font-medium text-ink-300">New theme</span>
                    {diff.theme
                      .filter((t) => t.after.startsWith("#") || t.after.startsWith("rgb"))
                      .slice(0, 7)
                      .map((t) => (
                        <span
                          key={t.key}
                          className="inline-flex items-center gap-1 rounded-md border border-ink-800 px-1.5 py-1 text-[10.5px] text-ink-400"
                        >
                          <span
                            className="h-3 w-3 rounded-full border border-ink-700"
                            style={{ background: t.before }}
                          />
                          <span aria-hidden>→</span>
                          <span
                            className="h-3 w-3 rounded-full border border-ink-700"
                            style={{ background: t.after }}
                          />
                        </span>
                      ))}
                  </label>
                ) : null}

                {diff.changed.length ? (
                  <>
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-500">
                      <button
                        type="button"
                        onClick={() => setMergeSel(new Set(diff.changed.map((c) => c.nodeId)))}
                        className="hover:text-ink-200"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setMergeSel(new Set())}
                        className="hover:text-ink-200"
                      >
                        None
                      </button>
                      <span>· tick the blocks to bring over</span>
                    </div>
                    <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                      {diff.changed.map((c) => (
                        <label
                          key={c.nodeId}
                          className="flex cursor-pointer gap-2 text-[12px] leading-snug"
                        >
                          <input
                            type="checkbox"
                            checked={mergeSel.has(c.nodeId)}
                            onChange={(e) =>
                              setMergeSel((s) => {
                                const next = new Set(s);
                                if (e.target.checked) next.add(c.nodeId);
                                else next.delete(c.nodeId);
                                return next;
                              })
                            }
                            className="mt-0.5 accent-flux-500"
                          />
                          <span className="min-w-0">
                            <span className="block text-[10px] uppercase tracking-wide text-ink-600">
                              {c.type}
                              {c.conflict ? (
                                <span className="ml-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-px text-[9px] font-semibold normal-case tracking-normal text-amber-400">
                                  ⚠ also edited on {site.parentName ?? "the parent"} — merging
                                  overwrites it
                                </span>
                              ) : null}
                            </span>
                            <span className="block text-red-400/80 line-through">
                              {c.fields[0].before}
                            </span>
                            <span className="block text-emerald-400">{c.fields[0].after}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                ) : null}

                {/* ── Structure: sections/blocks/pages added or removed ── */}
                <StructureGroup
                  title="Added on this branch"
                  hint="Ticked items are created on the parent, in place."
                  items={[
                    ...diff.sectionsAdded.map((s) => ({
                      key: `as:${s.branchComponentId}`,
                      label: `${s.kind} section on ${s.pagePath}`,
                      sample: s.sample,
                    })),
                    ...diff.addedNodes.map((a) => ({
                      key: `an:${a.nodeId}`,
                      label: `${a.type} block`,
                      sample: a.sample,
                    })),
                    ...diff.pagesAdded.map((p) => ({
                      key: `ap:${p.path}`,
                      label: `Page ${p.path}`,
                      sample: p.title,
                    })),
                  ]}
                  tone="add"
                  sel={structSel}
                  setSel={setStructSel}
                />
                <StructureGroup
                  title="Removed on this branch"
                  hint="Unticked by default — ticking deletes these from the parent too."
                  items={[
                    ...diff.sectionsRemoved.map((s) => ({
                      key: `rs:${s.parentComponentId}`,
                      label: `${s.kind} section on ${s.pagePath}`,
                      sample: s.sample,
                    })),
                    ...diff.removedNodes.map((r) => ({
                      key: `rn:${r.nodeId}`,
                      label: `${r.type} block`,
                      sample: r.sample,
                    })),
                    ...diff.pagesRemoved.map((path) => ({
                      key: `rp:${path}`,
                      label: `Page ${path}`,
                      sample: "",
                    })),
                  ]}
                  tone="remove"
                  sel={structSel}
                  setSel={setStructSel}
                />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <h2 className="display mt-2 text-[20px] text-ink-100">Branch this site</h2>
            <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-300">
              Fork a full copy you can redesign freely — by hand or with AI — without touching what's
              live. Then review a block-level diff and merge the changes back as one version. Like
              Git, for your website.
            </p>
            <p className="mt-1.5 max-w-prose text-[12px] leading-relaxed text-ink-500">
              A branch covers your <b className="text-ink-300">design</b> — pages, copy, theme. The
              store, images and blog stay shared: live data isn't branched, the same way restoring
              an old version never un-places an order.
            </p>
            <button
              type="button"
              onClick={() => void branchSite()}
              disabled={busy === "branch"}
              className="mt-3 rounded-lg border border-ink-700 px-4 py-2 text-[13px] font-semibold text-ink-100 transition-colors hover:border-ink-500 disabled:opacity-40"
            >
              {busy === "branch" ? "Branching…" : "⑂ Branch this site"}
            </button>
          </>
        )}
      </section>

      {/* ── 4a. AI rebrand ───────────────────────────────────────────────── */}
      <section className="mt-5 overflow-hidden rounded-xl border border-ink-800 bg-ink-900 p-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-flux-400">
          <span aria-hidden>✨</span> AI rebrand
        </div>
        <h2 className="display mt-2 text-[20px] text-ink-100">Reimagine the whole site in one line</h2>
        <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-300">
          Describe a new look and tone. The AI rewrites the words on every page and restyles your
          theme, then publishes it as one version — so a single rollback undoes all of it.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void rebrand();
          }}
          className="mt-4 flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={rebrandVibe}
            onChange={(e) => setRebrandVibe(e.target.value)}
            disabled={busy === "rebrand" || !!watching}
            placeholder="e.g. a dark, high-end luxury real-estate brand"
            className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13px] text-ink-100 outline-none placeholder:text-ink-600 focus:border-flux-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy === "rebrand" || !!watching || rebrandVibe.trim().length < 3}
            className="shrink-0 rounded-lg bg-flux-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:opacity-40"
          >
            {busy === "rebrand" ? "Rebranding…" : watching ? "Publishing…" : "Rebrand & publish"}
          </button>
          <button
            type="button"
            onClick={() => void getDirections()}
            disabled={busy === "directions" || busy === "rebrand" || !!watching}
            title="Let the AI propose three brand concepts to choose from"
            className="shrink-0 rounded-lg border border-flux-500/50 px-4 py-2 text-[13px] font-semibold text-flux-400 transition-colors hover:bg-flux-500/10 disabled:opacity-40"
          >
            {busy === "directions" ? "Thinking…" : "Give me 3 directions"}
          </button>
        </form>

        {directions && directions.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {directions.map((d, i) => (
              <div key={i} className="flex flex-col rounded-xl border border-ink-800 bg-ink-950 p-3">
                <div className="flex gap-1">
                  {[d.tokens.colorBg, d.tokens.colorSurface, d.tokens.colorAccent, d.tokens.colorFg].map(
                    (c, j) => (
                      <span
                        key={j}
                        className="h-5 w-5 rounded-full border border-ink-700"
                        style={{ background: c }}
                      />
                    ),
                  )}
                </div>
                <div className="mt-2 text-[13px] font-semibold text-ink-100">{d.name}</div>
                <div className="mt-1 flex-1 text-[12px] italic leading-snug text-ink-300">
                  “{d.sampleHeadline}”
                </div>
                <button
                  type="button"
                  onClick={() => void runRebrand(d.vibe)}
                  disabled={busy === "rebrand" || !!watching}
                  className="mt-2.5 w-full rounded-lg bg-flux-500 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:opacity-40"
                >
                  Use this
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-ink-500">
            Changes every page at once. It becomes a new version you can roll back with one click.
          </p>
        )}
      </section>

      {/* ── 4a-ii. AI translate ──────────────────────────────────────────── */}
      <section className="mt-5 overflow-hidden rounded-xl border border-ink-800 bg-ink-900 p-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-flux-400">
          <span aria-hidden>🌍</span> AI translate
        </div>
        <h2 className="display mt-2 text-[20px] text-ink-100">Go multilingual in one click</h2>
        <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-300">
          Pick languages and the AI translates every page, serving each at its own address
          (<span className="font-mono text-ink-400">/es</span>,{" "}
          <span className="font-mono text-ink-400">/fr</span>…) with a language switcher added to your
          nav. It's published as one version, so a single rollback removes them all.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {TRANSLATE_LOCALES.map((l) => {
            const on = translateSel.has(l.code);
            return (
              <button
                key={l.code}
                type="button"
                aria-pressed={on}
                disabled={busy === "translate" || !!watching}
                onClick={() =>
                  setTranslateSel((s) => {
                    const next = new Set(s);
                    if (next.has(l.code)) next.delete(l.code);
                    else next.add(l.code);
                    return next;
                  })
                }
                className={cx(
                  "rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-40",
                  on
                    ? "border-flux-500 bg-flux-500/15 text-flux-200"
                    : "border-ink-700 text-ink-300 hover:border-ink-500",
                )}
              >
                {l.native}
                <span className="ml-1.5 font-mono text-[10.5px] text-ink-500">/{l.code}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runTranslate()}
            disabled={busy === "translate" || !!watching || translateSel.size === 0}
            className="rounded-lg bg-flux-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:opacity-40"
          >
            {busy === "translate"
              ? "Translating…"
              : watching
                ? "Publishing…"
                : `Translate into ${translateSel.size || "…"} language${translateSel.size === 1 ? "" : "s"} & publish`}
          </button>
          {translated.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-400">
              <span>Live:</span>
              {translated.map((code) => (
                <a
                  key={code}
                  href={
                    site.customDomain
                      ? `https://${site.customDomain}/${code}`
                      : `/s/${site.slug}/${code}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-ink-700 px-2 py-0.5 font-mono text-[11px] text-flux-300 hover:border-flux-500/50"
                >
                  /{code} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── 4b. your own domain ──────────────────────────────────────────── */}
      <CustomDomainCard className="mt-5" siteId={site.id} initialDomain={site.customDomain} />

      {/* ── 4c. headless Content API ─────────────────────────────────────── */}
      <ContentApiCard className="mt-5" siteId={site.id} slug={site.slug} />

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

      {/* ── Danger zone: delete this site ────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-red-500/25 bg-red-500/[0.03] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-100">Delete this site</h2>
            <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-ink-400">
              Permanently removes <span className="font-medium text-ink-200">{site.name}</span> and
              everything in it — pages, versions, media. This can't be undone.
            </p>
          </div>
          {confirmDelete ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void deleteSite()}
                disabled={busy === "delete"}
                className="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {busy === "delete" ? "Deleting…" : "Delete forever"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={busy === "delete"}
                className="rounded-lg border border-ink-700 px-3 py-2 text-[13px] font-semibold text-ink-200 transition-colors hover:border-ink-500 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="shrink-0 rounded-lg border border-red-500/40 px-4 py-2 text-[13px] font-semibold text-red-400 transition-colors hover:bg-red-500/10"
            >
              Delete site
            </button>
          )}
        </div>
      </section>
          </div>
        </main>
      </div>
    </TechnicalDetails>
  );
}

/* ── top bar ──────────────────────────────────────────────────────────────── */

function TopBar({ modules }: { modules: string[] }) {
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
        <LinkBtn href="/dashboard/blog" size="sm" variant="quiet">
          Blog
        </LinkBtn>
        <LinkBtn href="/dashboard/media" size="sm" variant="quiet">
          Images
        </LinkBtn>
        {modules.includes("forms") && (
          <LinkBtn href="/dashboard/forms" size="sm" variant="quiet">
            Forms
          </LinkBtn>
        )}
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

          <SiteTitle siteId={site.id} name={site.name} />

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
          <LinkBtn
            href="/build"
            variant="secondary"
            title="Describe a site in a sentence and let AI build it"
          >
            ✨ New AI site
          </LinkBtn>
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
              href={`/api/releases/${r.id}/export/nextjs`}
              download
              size="xs"
              variant="quiet"
              title="Download this exact version as an editable Next.js project"
            >
              Code
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
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              title="Export to code"
              detail="A real Next.js + TypeScript project — one component per section, your theme, ready to edit."
              cta="Download project"
              href={`/api/releases/${releaseId}/export/nextjs`}
              tech="Every block rendered by the same engine, emitted as React components. npm i && npm run dev."
              accent
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
  accent,
}: {
  title: string;
  detail: string;
  cta: string;
  href: string;
  external?: boolean;
  tech: string;
  accent?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      title={tech}
      className={cx(
        "group flex flex-col rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400",
        accent
          ? "border-flux-500/40 bg-flux-500/[0.06] hover:border-flux-500/70 hover:bg-flux-500/10"
          : "border-ink-800 bg-ink-950/60 hover:border-flux-500/40 hover:bg-ink-900/70",
      )}
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

/* ── branch structure picker ─────────────────────────────────────────────── */

/** One checkbox group of structural branch changes (adds or removes). */
function StructureGroup({
  title,
  hint,
  items,
  tone,
  sel,
  setSel,
}: {
  title: string;
  hint: string;
  items: { key: string; label: string; sample: string }[];
  tone: "add" | "remove";
  sel: Set<string>;
  setSel: (fn: (s: Set<string>) => Set<string>) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <div className="flex items-baseline gap-2">
        <span
          className={cx(
            "text-[11px] font-medium",
            tone === "add" ? "text-emerald-400" : "text-red-400/90",
          )}
        >
          {title}
        </span>
        <span className="text-[10.5px] text-ink-600">{hint}</span>
      </div>
      <div className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <label key={item.key} className="flex cursor-pointer gap-2 text-[12px] leading-snug">
            <input
              type="checkbox"
              checked={sel.has(item.key)}
              onChange={(e) =>
                setSel((s) => {
                  const next = new Set(s);
                  if (e.target.checked) next.add(item.key);
                  else next.delete(item.key);
                  return next;
                })
              }
              className="mt-0.5 accent-flux-500"
            />
            <span className="min-w-0">
              <span
                className={cx(
                  "block",
                  tone === "add" ? "text-emerald-400" : "text-red-400/80 line-through",
                )}
              >
                {item.label}
              </span>
              {item.sample ? (
                <span className="block truncate text-[11px] text-ink-500">{item.sample}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
