"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { findNode, getSchema } from "@/lib/registry";
import { describeUsage, type ComponentUsage } from "@/lib/component-usage";
import { useEditor } from "@/lib/editor/store";
import { useAutosave, flushDraft } from "@/lib/editor/useAutosave";
import { stripExpansion } from "@/lib/shared-components";
import type {
  ModuleName,
  PageBody,
  RenderContext,
  ResolvedSharedComponent,
  ThemeLayout,
  ThemeTokens,
} from "@/lib/registry/types";
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
  /** The site's shared components, for the palette and for canvas expansion. */
  components: ResolvedSharedComponent[];
  /**
   * Set when this session is editing a shared component instead of a page.
   *
   * Everything else on this screen is identical, which is the point: a symbol is
   * a tree of the same blocks in the same format, so it gets the same editor
   * rather than a lesser one.
   *
   * `usage` is loaded server-side so the blast radius is visible before the first
   * keystroke, not discovered after publishing.
   */
  component?: { id: string; name: string; usage: ComponentUsage };
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

  const body = useEditor((s) => s.body);
  const router = useRouter();

  const [leftTab, setLeftTab] = useState<LeftTab>("blocks");
  const [rightTab, setRightTab] = useState<RightTab>("design");
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("desktop");
  const [busy, setBusy] = useState(false);

  const editingComponent = boot.component;

  // Theme edits apply to the canvas immediately, before they are saved.
  const [tokens, setTokens] = useState<ThemeTokens>(boot.ctx.tokens);
  const [layout, setLayout] = useState<ThemeLayout>(boot.layout);

  /**
   * While editing a symbol, its own live tree replaces the saved copy in the
   * expansion map. Without this, a symbol that contained another instance of
   * itself — or simply the preview of what you are typing — would render from a
   * stale snapshot.
   */
  const components = useMemo(() => {
    const map: Record<string, ResolvedSharedComponent> = {};
    for (const c of boot.components) map[c.id] = c;
    if (editingComponent) {
      map[editingComponent.id] = {
        id: editingComponent.id,
        name: editingComponent.name,
        root: body.root,
      };
    }
    return map;
  }, [boot.components, editingComponent, body.root]);

  const ctx: RenderContext = { ...boot.ctx, tokens, components };

  const targetId = editingComponent?.id ?? boot.page.id;

  useEffect(() => {
    init(targetId, boot.body, boot.lockVersion, editingComponent ? "component" : "page");
  }, [init, targetId, boot.body, boot.lockVersion, editingComponent]);

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

  /**
   * Make component — lift the selected block out of this page and replace it
   * with a reference to a new shared definition.
   *
   * The order matters. Create the component first; only swap the node once the
   * server has confirmed it, so a failed request leaves the page exactly as it
   * was rather than pointing at a symbol that does not exist.
   */
  const makeComponent = useCallback(async () => {
    const state = useEditor.getState();
    const selected = state.selectedId;
    if (!selected || busy) return;

    const node = findNodeIn(state.body.root, selected);
    if (!node) return;

    const suggested = defaultComponentName(node.type, boot.components.length);
    const name = window.prompt("Name this component", suggested)?.trim();
    if (!name) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/sites/${boot.site.id}/components`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          // A single block becomes a one-block component. `stripExpansion`
          // guards the invariant that only storable nodes are ever sent.
          body: { version: 1, root: stripExpansion([node]) },
        }),
      });

      if (res.status === 409) {
        const data = await res.json();
        window.alert(data.message ?? "A component with that name already exists.");
        return;
      }
      if (!res.ok) {
        window.alert(`Could not create the component (${res.status}).`);
        return;
      }

      const created = (await res.json()) as { id: string };

      // Swap the block for a reference to it, then persist and reload so the
      // palette and the expansion map both pick the new symbol up.
      useEditor.getState().replaceWithComponentRef(selected, created.id);
      await flushDraft();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [boot.site.id, boot.components.length, busy, router]);

  /** Create an empty symbol and go straight to editing it. */
  const newComponent = useCallback(async () => {
    if (busy) return;
    const name = window.prompt("Name the new component")?.trim();
    if (!name) return;

    setBusy(true);
    try {
      await flushDraft(); // don't lose the current page's edits on navigate
      const res = await fetch(`/api/sites/${boot.site.id}/components`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, body: { version: 1, root: [] } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.message ?? `Could not create the component (${res.status}).`);
        return;
      }
      const created = (await res.json()) as { id: string };
      router.push(`/editor/component/${created.id}`);
    } finally {
      setBusy(false);
    }
  }, [boot.site.id, busy, router]);

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

        {editingComponent ? (
          // Editing a symbol is a different act from editing a page, and the
          // header says so in NUMBERS. "Changes every page that uses it" is a
          // sentence people stop seeing; "changes 12 pages: /, /about, /pricing"
          // is a fact they can act on before they type.
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#22c7a9]/15 px-2.5 py-1.5 text-[12px] font-medium text-[#22c7a9]">
              ◈ {editingComponent.name}
            </span>
            <span
              className={cx(
                "shrink-0 rounded-lg px-2 py-1.5 text-[11.5px] font-medium",
                editingComponent.usage.totalPages > 0
                  ? "bg-warn-500/15 text-warn-500"
                  : "text-ink-500",
              )}
              title={
                editingComponent.usage.totalPages > 0
                  ? `Publishing will change: ${[
                      ...editingComponent.usage.pages.map((p) => p.path),
                      ...editingComponent.usage.indirectPages.map((p) => `${p.path} (nested)`),
                    ].join(", ")}`
                  : "Nothing points at this component yet"
              }
            >
              {describeUsage(editingComponent.usage)}
            </span>
            {editingComponent.usage.totalPages > 0 && (
              <span className="truncate text-[11.5px] text-ink-500">
                {[...editingComponent.usage.pages, ...editingComponent.usage.indirectPages]
                  .slice(0, 4)
                  .map((p) => p.path)
                  .join("  ")}
                {editingComponent.usage.totalPages > 4 ? "  …" : ""}
              </span>
            )}
          </div>
        ) : (
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
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!editingComponent && (
            <button
              type="button"
              onClick={makeComponent}
              disabled={!selectedId || busy}
              title="Turn the selected block into a shared component reusable across pages"
              className="rounded-lg border border-[#22c7a9]/40 px-2.5 py-1.5 text-[12px] text-[#22c7a9] transition-colors hover:border-[#22c7a9] hover:bg-[#22c7a9]/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ◈ Make component
            </button>
          )}

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
            {leftTab === "blocks" ? (
              <Palette
                modules={boot.modules}
                // A symbol cannot list itself: the most obvious loop, refused at
                // the point of temptation. Deeper loops are caught at publish.
                components={boot.components.filter((c) => c.id !== editingComponent?.id)}
                onNewComponent={newComponent}
                onEditComponent={(id) => router.push(`/editor/component/${id}`)}
              />
            ) : (
              <Layers components={components} />
            )}
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
                {editingComponent
                  ? `◈ ${editingComponent.name}`
                  : `${boot.site.slug}${boot.page.path}`}
              </span>
              <span
                className={cx(
                  "rounded-full border px-2 py-0.5 text-[10px]",
                  editingComponent
                    ? "border-[#22c7a9]/40 text-[#22c7a9]"
                    : "border-ink-700 text-ink-500",
                )}
              >
                {editingComponent ? "shared" : "draft"}
              </span>
            </div>
            <Canvas ctx={ctx} />
          </div>

          <p className="mx-auto mt-4 max-w-3xl text-center text-[11px] leading-relaxed text-ink-500">
            {editingComponent ? (
              <>
                {editingComponent.usage.totalPages > 0 ? (
                  <>
                    You are editing a shared component.{" "}
                    <span className="text-warn-500">
                      Publishing changes {editingComponent.usage.totalPages} page
                      {editingComponent.usage.totalPages === 1 ? "" : "s"} at once
                    </span>
                    . To change only one of them, go back to that page and edit the text directly —
                    that records an override for that page alone.
                  </>
                ) : (
                  <>
                    You are editing a shared component. Nothing uses it yet, so publishing changes
                    nothing else.
                  </>
                )}
              </>
            ) : (
              <>
                Double-click text to edit it in place. Drag blocks from the left, or drag them on the
                canvas to reorder. Text inside a{" "}
                <span className="text-[#22c7a9]">◈ component</span> becomes an override on this page
                only.
              </>
            )}
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
            {rightTab === "design" && (
              <Properties refOptions={boot.refOptions} tokens={tokens} components={components} />
            )}
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

/** Local re-export so the shell doesn't reach into the registry for one lookup. */
function findNodeIn(nodes: PageBody["root"], id: string) {
  return findNode(nodes, id);
}

/** "Hero" + no existing symbols → "Hero 1". Just a starting point to type over. */
function defaultComponentName(type: string, existing: number): string {
  const base = getSchema(type)?.label ?? type;
  return `${base} ${existing + 1}`;
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
