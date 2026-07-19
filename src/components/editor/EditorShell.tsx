"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useEditor } from "@/lib/editor/store";
import { useAutosave } from "@/lib/editor/useAutosave";
import type { ModuleName, PageBody, RenderContext, ThemeLayout, ThemeTokens } from "@/lib/registry/types";
import { Canvas } from "./Canvas";
import { Palette } from "./Palette";
import { Properties, type RefOptions } from "./Properties";
import { PublishPanel } from "./PublishPanel";
import { SaveIndicator } from "./SaveIndicator";
import { Layers } from "./Layers";
import { ThemePanel } from "./ThemePanel";
import { cx } from "../ui";

export interface EditorBootstrap {
  page: { id: string; path: string; title: string };
  site: { id: string; name: string; slug: string };
  body: PageBody;
  lockVersion: number;
  modules: ModuleName[];
  ctx: RenderContext;
  layout: ThemeLayout;
  refOptions: RefOptions;
  siblings: { id: string; path: string; title: string }[];
}

type LeftTab = "blocks" | "outline";
type RightTab = "design" | "theme" | "publish";

const DEVICES = [
  { id: "desktop", label: "Desktop", width: 0, icon: "▭" },
  { id: "tablet", label: "Tablet", width: 834, icon: "▯" },
  { id: "mobile", label: "Mobile", width: 390, icon: "▮" },
] as const;

export function EditorShell(boot: EditorBootstrap) {
  const init = useEditor((s) => s.init);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const removeNode = useEditor((s) => s.removeNode);
  const select = useEditor((s) => s.select);
  const selectedId = useEditor((s) => s.selectedId);
  const pastLength = useEditor((s) => s.past.length);
  const futureLength = useEditor((s) => s.future.length);

  const [leftTab, setLeftTab] = useState<LeftTab>("blocks");
  const [rightTab, setRightTab] = useState<RightTab>("design");
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("desktop");

  // Theme edits apply to the canvas immediately, before they are saved.
  const [tokens, setTokens] = useState<ThemeTokens>(boot.ctx.tokens);
  const [layout, setLayout] = useState<ThemeLayout>(boot.layout);
  const ctx: RenderContext = { ...boot.ctx, tokens };

  useEffect(() => {
    init(boot.page.id, boot.body, boot.lockVersion);
  }, [init, boot.page.id, boot.body, boot.lockVersion]);

  useAutosave(true);

  useEffect(() => {
    if (selectedId) setRightTab("design");
  }, [selectedId]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (typing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeNode(selectedId);
      }
      if (e.key === "Escape") select(null);
    },
    [undo, redo, removeNode, select, selectedId],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const frameWidth = DEVICES.find((d) => d.id === device)!.width;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink-950">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex h-13 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-900 px-3 py-2.5">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-ink-300 transition-colors hover:bg-ink-850 hover:text-ink-100"
        >
          <span className="text-ink-500">←</span>
          <span className="max-w-32 truncate">{boot.site.name}</span>
        </Link>

        <div className="h-5 w-px shrink-0 bg-ink-700" />

        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {boot.siblings.map((p) => (
            <Link
              key={p.id}
              href={`/editor/${p.id}`}
              className={cx(
                "shrink-0 rounded-lg px-2.5 py-1.5 font-mono text-[11.5px] transition-colors",
                p.id === boot.page.id
                  ? "bg-ink-800 text-ink-100"
                  : "text-ink-400 hover:bg-ink-850 hover:text-ink-200",
              )}
            >
              {p.path}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-ink-800 p-0.5">
            <IconButton title="Undo (Ctrl+Z)" onClick={undo} disabled={pastLength === 0}>
              ↶
            </IconButton>
            <IconButton title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={futureLength === 0}>
              ↷
            </IconButton>
          </div>

          <div className="flex items-center gap-0.5 rounded-lg border border-ink-800 p-0.5">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                title={d.label}
                onClick={() => setDevice(d.id)}
                className={cx(
                  "rounded-md px-2 py-1 text-[12px] transition-colors",
                  device === d.id ? "bg-ink-800 text-ink-100" : "text-ink-500 hover:text-ink-300",
                )}
              >
                {d.icon}
              </button>
            ))}
          </div>

          <SaveIndicator />

          <a
            href={`/s/${boot.site.slug}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-ink-700 px-2.5 py-1.5 text-[12px] text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-100"
          >
            View live
          </a>
          <button
            type="button"
            onClick={() => setRightTab("publish")}
            className="rounded-lg bg-flux-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-flux-400"
          >
            Publish
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Left ──────────────────────────────────────────────────────── */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900">
          <Tabs
            tabs={[
              { id: "blocks", label: "Blocks" },
              { id: "outline", label: "Outline" },
            ]}
            active={leftTab}
            onChange={(id) => setLeftTab(id as LeftTab)}
          />
          <div className="min-h-0 flex-1">
            {leftTab === "blocks" ? <Palette modules={boot.modules} /> : <Layers />}
          </div>
        </aside>

        {/* ── Canvas ────────────────────────────────────────────────────── */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-ink-850 p-5">
          <div
            className="mx-auto overflow-hidden rounded-xl border border-ink-700 shadow-2xl shadow-black/40 transition-all duration-300"
            style={{ maxWidth: frameWidth ? `${frameWidth}px` : "1240px" }}
          >
            <div className="flex items-center gap-2 border-b border-ink-700 bg-ink-900 px-3 py-2">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink-700" />
              </span>
              <span className="ml-2 flex-1 truncate rounded-md bg-ink-950 px-2.5 py-1 text-center font-mono text-[11px] text-ink-400">
                {boot.site.slug}
                {boot.page.path}
              </span>
              <span className="rounded-full border border-ink-700 px-2 py-0.5 text-[10px] text-ink-500">
                draft
              </span>
            </div>
            <Canvas ctx={ctx} />
          </div>

          <p className="mx-auto mt-4 max-w-3xl text-center text-[11px] leading-relaxed text-ink-500">
            Double-click text to edit it in place. Drag blocks from the left, or drag them on the
            canvas to reorder.
          </p>
        </main>

        {/* ── Right ─────────────────────────────────────────────────────── */}
        <aside className="flex w-[19rem] shrink-0 flex-col border-l border-ink-800 bg-ink-900">
          <Tabs
            tabs={[
              { id: "design", label: "Block" },
              { id: "theme", label: "Site" },
              { id: "publish", label: "Publish" },
            ]}
            active={rightTab}
            onChange={(id) => setRightTab(id as RightTab)}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rightTab === "design" && <Properties refOptions={boot.refOptions} tokens={tokens} />}
            {rightTab === "theme" && (
              <ThemePanel
                siteId={boot.site.id}
                tokens={tokens}
                layout={layout}
                onChange={(t, l) => {
                  setTokens(t);
                  setLayout(l);
                }}
              />
            )}
            {rightTab === "publish" && (
              <PublishPanel siteId={boot.site.id} siteSlug={boot.site.slug} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex shrink-0 border-b border-ink-800">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx(
            "flex-1 px-2 py-2.5 text-[12px] font-medium transition-colors",
            active === t.id
              ? "border-b-2 border-flux-500 text-ink-100"
              : "text-ink-500 hover:text-ink-300",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-2 py-1 text-[13px] text-ink-400 transition-colors hover:bg-ink-850 hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
