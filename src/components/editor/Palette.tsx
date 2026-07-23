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
import type { ComponentSchema, ModuleName, ResolvedComponent } from "@/lib/registry/types";
import { useEditor } from "@/lib/editor/store";
import { cx } from "../ui";
import { DRAG_ADD, DRAG_ADD_COMPONENT } from "./Canvas";

const CATEGORY_LABEL: Record<string, string> = {
  content: "Content",
  layout: "Layout",
  commerce: "Commerce",
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
  const [query, setQuery] = useState("");

  const available = useMemo(() => paletteFor(modules), [modules]);

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
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#22c7a9]">
              Components
            </span>
            {onNewComponent && (
              <button
                type="button"
                onClick={onNewComponent}
                title="Create an empty shared component"
                className="rounded px-1 text-[13px] leading-none text-ink-500 transition-colors hover:text-[#22c7a9]"
              >
                +
              </button>
            )}
          </div>

          {matchingComponents.length === 0 ? (
            <p className="px-1 text-[10.5px] leading-relaxed text-ink-500">
              {components.length === 0
                ? "None yet. Select a block on the page and choose “Make component” to reuse it across pages."
                : `No components match “${query}”.`}
            </p>
          ) : (
            <div className="grid gap-1.5">
              {matchingComponents.map((component) => (
                <div
                  key={component.id}
                  className="group flex items-stretch overflow-hidden rounded-lg border border-ink-800 bg-ink-950 transition-colors hover:border-[#22c7a9]/50"
                >
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_ADD_COMPONENT, component.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addComponentRef(component.id)}
                    title={`Add “${component.name}” — stays linked, so editing it updates every page`}
                    className="flex flex-1 cursor-grab items-center gap-2 px-2.5 py-2 text-left active:cursor-grabbing"
                  >
                    <span className="text-[13px] leading-none text-[#22c7a9]">◈</span>
                    <span className="truncate text-[11.5px] font-medium text-ink-200">
                      {component.name}
                    </span>
                  </button>
                  {onEditComponent && (
                    <button
                      type="button"
                      onClick={() => onEditComponent(component.id)}
                      title="Edit this component — changes every page using it"
                      className="grid w-7 place-items-center border-l border-ink-800 text-[11px] text-ink-500 transition-colors hover:bg-ink-850 hover:text-[#22c7a9]"
                    >
                      ✎
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {["content", "layout", "commerce"].map((category) => {
          const items = byCategory[category];
          if (!items?.length) return null;
          return (
            <div key={category} className="mb-4">
              <div className="mb-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
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
                  Shown because this site has the commerce module enabled.
                </p>
              )}
            </div>
          );
        })}

        {matching.length === 0 && matchingComponents.length === 0 && (
          <p className="px-1 py-6 text-center text-[12px] text-ink-500">
            No blocks match “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
