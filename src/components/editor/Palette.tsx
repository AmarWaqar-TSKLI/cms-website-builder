"use client";

/**
 * The palette, filtered by the site's enabled modules. (D6)
 *
 * ProductGrid is absent for a site without commerce — not disabled, absent.
 * Engine + blog is WordPress; engine + commerce is Shopify; the difference is
 * a row in site_modules, not a different product.
 */
import { paletteFor } from "@/lib/registry";
import type { ComponentSchema, ModuleName } from "@/lib/registry/types";
import { useEditor } from "@/lib/editor/store";
import { Note, SectionLabel } from "../ui";

export function Palette({ modules }: { modules: ModuleName[] }) {
  const addNode = useEditor((s) => s.addNode);
  const available = paletteFor(modules);

  const engine = available.filter((s) => !s.requiresModule);
  const moduleBlocks = available.filter((s) => s.requiresModule);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-800 p-4">
        <SectionLabel>Palette</SectionLabel>
        <Note>Click to append. Each block declares a prop schema.</Note>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <Group title="Engine" items={engine} onAdd={addNode} />
        {moduleBlocks.length > 0 && (
          <Group
            title="Commerce module"
            items={moduleBlocks}
            onAdd={addNode}
            hint="Only visible because site_modules has a commerce row."
          />
        )}
      </div>
    </div>
  );
}

function Group({
  title,
  items,
  onAdd,
  hint,
}: {
  title: string;
  items: ComponentSchema[];
  onAdd: (type: string) => void;
  hint?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-5">
      <div className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
        {title}
      </div>
      <div className="space-y-1">
        {items.map((schema) => (
          <button
            key={schema.name}
            type="button"
            onClick={() => onAdd(schema.name)}
            title={schema.description}
            className="group flex w-full items-start gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-ink-700 hover:bg-ink-850"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ink-700 bg-ink-850 text-[13px] text-ink-300 transition-colors group-hover:border-flux-500/50 group-hover:text-flux-300">
              {schema.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink-100">{schema.label}</span>
              <span className="block truncate text-[11px] text-ink-500">{schema.description}</span>
            </span>
          </button>
        ))}
      </div>
      {hint && <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-500">{hint}</p>}
    </div>
  );
}
