"use client";

/**
 * The canvas.
 *
 * This resolves node types through the SAME registry the build worker uses and
 * calls the SAME pure render functions. There is no editor-specific preview
 * implementation to drift out of sync — what you are looking at is the artifact,
 * minus the selection chrome.
 */
import { getComponent } from "@/lib/registry";
import type { PageNode, RenderContext } from "@/lib/registry/types";
import { useEditor } from "@/lib/editor/store";
import { cx } from "../ui";

export function Canvas({ ctx }: { ctx: RenderContext }) {
  const body = useEditor((s) => s.body);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);

  if (body.root.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <div className="max-w-sm text-center">
          <div className="mb-3 text-sm font-medium text-ink-200">Empty page</div>
          <p className="text-[13px] leading-relaxed text-ink-400">
            Add a block from the palette. What gets stored is its name and props — never
            markup.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-full bg-white"
      style={{ colorScheme: "light" }}
      onClick={() => select(null)}
    >
      {body.root.map((node) => (
        <NodeFrame
          key={node.id}
          node={node}
          ctx={ctx}
          selected={node.id === selectedId}
          onSelect={select}
        />
      ))}
    </div>
  );
}

function NodeFrame({
  node,
  ctx,
  selected,
  onSelect,
}: {
  node: PageNode;
  ctx: RenderContext;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const entry = getComponent(node.type);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
      className={cx(
        "relative cursor-default outline-none transition-shadow",
        selected
          ? "shadow-[inset_0_0_0_2px_#6d5cff]"
          : "hover:shadow-[inset_0_0_0_1px_rgba(109,92,255,.45)]",
      )}
    >
      {selected && (
        <span className="pointer-events-none absolute left-0 top-0 z-10 rounded-br-md bg-flux-500 px-2 py-0.5 font-mono text-[10px] font-medium text-white">
          {node.type}
        </span>
      )}
      {entry ? (
        entry.render({ node, props: node.props, ctx })
      ) : (
        <div className="p-6 font-mono text-xs text-red-500">Unknown component “{node.type}”</div>
      )}
    </div>
  );
}
