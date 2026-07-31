"use client";

/**
 * The palette, filtered by the site's enabled modules. (D6)
 *
 * ProductGrid is absent for a site without commerce — not disabled, absent.
 * Engine + blog is WordPress; engine + commerce is Shopify; the difference is
 * a row in site_modules, not a different product.
 *
 * Blocks can be dragged onto the canvas or clicked to append.
 */
import { useMemo, useState } from "react";
import { paletteFor } from "@/lib/registry";
import type { ComponentSchema, ModuleName, PageNode, ResolvedComponent } from "@/lib/registry/types";
import { useEditor } from "@/lib/editor/store";
import { SECTION_TEMPLATES } from "@/lib/editor/sections";
import { cx } from "../ui";
import { useTechnical } from "../technical";
import { DRAG_ADD, DRAG_ADD_COMPONENT } from "./Canvas";

// The order blocks appear in the palette, and their friendly names. Ordered the
// way someone builds a page: the story first (marketing), then the words and
// pictures, then the store and blog, with structural helpers last.
const CATEGORY_ORDER = ["marketing", "content", "media", "commerce", "blog", "forms", "layout"] as const;

const CATEGORY_LABEL: Record<string, string> = {
  marketing: "Marketing",
  content: "Content",
  media: "Media",
  commerce: "Commerce",
  blog: "Blog",
  forms: "Forms",
  layout: "Layout",
};

export function Palette({
  modules,
  components = [],
  onNewComponent,
  onEditComponent,
}: {
  modules: ModuleName[];
  /** The site's shared components. Listed separately — they are this site's, not the engine's. */
  components?: ResolvedComponent[];
  onNewComponent?: () => void;
  onEditComponent?: (id: string) => void;
}) {
  const addNode = useEditor((s) => s.addNode);
  const addComponentRef = useEditor((s) => s.addComponentRef);
  const insertSection = useEditor((s) => s.insertSection);
  const [query, setQuery] = useState("");
  const technical = useTechnical();

  // "Ask AI to add a section" — the instruction goes to /api/ai/section, which
  // returns registry-validated blocks; insertSection drops them in exactly like
  // a Sections-palette click, so the result is ordinary, editable and undoable.
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function askAi() {
    const instruction = aiPrompt.trim();
    if (instruction.length < 3 || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/section", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const data = (await res.json().catch(() => ({}))) as { blocks?: unknown; error?: string };
      if (!res.ok) throw new Error(data.error || "The AI couldn't build that.");
      const blocks = Array.isArray(data.blocks) ? (data.blocks as PageNode[]) : [];
      if (!blocks.length) throw new Error("The AI returned nothing usable — try rewording it.");
      insertSection(blocks);
      setAiPrompt("");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAiBusy(false);
    }
  }

  const available = useMemo(() => paletteFor(modules), [modules]);

  const matchingSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTION_TEMPLATES;
    return SECTION_TEMPLATES.filter(
      (s) => s.label.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }, [query]);

  const matchingComponents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return components;
    return components.filter((c) => c.name.toLowerCase().includes(q));
  }, [components, query]);
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (s) => s.label.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }, [available, query]);

  const byCategory = useMemo(() => {
    const groups: Record<string, ComponentSchema[]> = {};
    for (const schema of matching) (groups[schema.category] ??= []).push(schema);
    return groups;
  }, [matching]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-800 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void askAi();
          }}
          className="mb-3"
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-tight text-flux-400">
            <span aria-hidden>✨</span> Ask AI to add a section
          </div>
          <div className="flex gap-1.5">
            <input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              disabled={aiBusy}
              placeholder="e.g. a pricing section with 3 tiers"
              className="w-full rounded-lg border border-flux-500/40 bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-ink-100 outline-none placeholder:text-ink-600 focus:border-flux-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={aiBusy || aiPrompt.trim().length < 3}
              className="shrink-0 rounded-lg bg-flux-500 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:opacity-40"
            >
              {aiBusy ? "…" : "Add"}
            </button>
          </div>
          {aiBusy ? (
            <p className="mt-1.5 text-[11px] text-ink-500">Composing your section…</p>
          ) : aiError ? (
            <p className="mt-1.5 text-[11px] text-red-400">{aiError}</p>
          ) : null}
        </form>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search blocks"
          className="w-full rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-ink-100 outline-none placeholder:text-ink-600 focus:border-flux-500"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
          Drag onto the page, or click to add at the end.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5">
        {/*
          Shared components come first, deliberately. Once a site has a header
          and a footer, they are the blocks you reach for most, and putting them
          above the generic palette is what makes reuse the default rather than
          something you have to remember to do.
        */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold tracking-tight text-reuse-500">
              Reusable blocks
            </span>
            {onNewComponent && (
              <button
                type="button"
                onClick={onNewComponent}
                title="Create a new reusable block from scratch"
                className="rounded px-1 text-[13px] leading-none text-ink-500 transition-colors hover:text-reuse-500"
              >
                +
              </button>
            )}
          </div>

          {matchingComponents.length === 0 ? (
            <p className="px-1 text-[11px] leading-relaxed text-ink-500">
              {components.length === 0
                ? "Nothing here yet. Select any block on the page, then choose “Reuse across pages” to reuse it — a header or footer, say, that stays in sync everywhere it appears."
                : `No reusable blocks match “${query}”.`}
            </p>
          ) : (
            <div className="grid gap-1.5">
              {matchingComponents.map((component) => (
                <div
                  key={component.id}
                  className="group flex items-stretch overflow-hidden rounded-lg border border-ink-800 bg-ink-950 transition-colors hover:border-reuse-500/50"
                >
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_ADD_COMPONENT, component.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addComponentRef(component.id)}
                    title={`Add “${component.name}”. It stays linked, so editing it updates every page that uses it.`}
                    className="flex flex-1 cursor-grab items-center gap-2 px-2.5 py-2 text-left active:cursor-grabbing"
                  >
                    <span aria-hidden className="text-[13px] leading-none text-reuse-500">◈</span>
                    <span className="truncate text-[11.5px] font-medium text-ink-200">
                      {component.name}
                    </span>
                  </button>
                  {onEditComponent && (
                    <button
                      type="button"
                      onClick={() => onEditComponent(component.id)}
                      title="Edit this block everywhere — changes every page that uses it"
                      className="grid w-7 place-items-center border-l border-ink-800 text-[11px] text-ink-500 transition-colors hover:bg-ink-850 hover:text-reuse-500"
                    >
                      ✎
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/*
          Sections: a whole designed part (pricing, testimonials, FAQ…) in one
          click. Above the individual blocks on purpose — reach for a ready-made
          section first, and drop to single blocks when you want to build by hand.
          Each one lands as ordinary editable blocks, so there is nothing special
          to learn once it is on the page.
        */}
        {matchingSections.length > 0 && (
          <div className="mb-4">
            <div className="mb-1 px-1 text-[11px] font-semibold tracking-tight text-flux-300">
              Sections
            </div>
            <p className="mb-1.5 px-1 text-[10.5px] leading-relaxed text-ink-500">
              A whole designed part in one click. Lands at the end of the page — then edit anything.
            </p>
            <div className="grid gap-1.5">
              {matchingSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => insertSection(section.blocks)}
                  title={`Add a ${section.label.toLowerCase()} section to the end of the page`}
                  className="group flex items-start gap-2.5 rounded-lg border border-ink-800 bg-ink-950 px-2.5 py-2 text-left transition-colors hover:border-flux-500/50 hover:bg-ink-850"
                >
                  <span aria-hidden className="mt-0.5 text-[13px] leading-none text-flux-300">
                    ▦
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] font-medium text-ink-200">
                      {section.label}
                    </span>
                    <span className="block text-[10.5px] leading-snug text-ink-500">
                      {section.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {CATEGORY_ORDER.map((category) => {
          const items = byCategory[category];
          if (!items?.length) return null;
          return (
            <div key={category} className="mb-4">
              <div className="mb-1.5 px-1 text-[11px] font-semibold tracking-tight text-ink-500">
                {CATEGORY_LABEL[category]}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map((schema) => (
                  <button
                    key={schema.name}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_ADD, schema.name);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addNode(schema.name)}
                    title={schema.description}
                    className={cx(
                      "group flex cursor-grab flex-col items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-950 px-2 py-3",
                      "transition-colors hover:border-flux-500/50 hover:bg-ink-850 active:cursor-grabbing",
                    )}
                  >
                    <span className="text-[15px] leading-none text-ink-400 transition-colors group-hover:text-flux-300">
                      {schema.icon}
                    </span>
                    <span className="text-center text-[11px] font-medium leading-tight text-ink-200">
                      {schema.label}
                    </span>
                  </button>
                ))}
              </div>
              {category === "commerce" && (
                <p className="mt-2 px-1 text-[10.5px] leading-relaxed text-ink-500">
                  Your online store is on, so shop blocks show up here.
                  {technical && (
                    <span className="mt-1 block font-mono text-ink-600">
                      Filtered by site_modules — a site without the commerce module never sees these.
                    </span>
                  )}
                </p>
              )}
              {category === "blog" && (
                <p className="mt-2 px-1 text-[10.5px] leading-relaxed text-ink-500">
                  Your blog is on. Write posts under “Blog” in the dashboard, then show them here.
                </p>
              )}
              {category === "forms" && (
                <p className="mt-2 px-1 text-[10.5px] leading-relaxed text-ink-500">
                  What visitors send lands in your Forms inbox in the dashboard.
                </p>
              )}
            </div>
          );
        })}

        {matching.length === 0 && matchingComponents.length === 0 && matchingSections.length === 0 && (
          <p className="px-1 py-6 text-center text-[12px] text-ink-500">
            No blocks match “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
