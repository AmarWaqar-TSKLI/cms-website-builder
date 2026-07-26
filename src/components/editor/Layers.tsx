"use client";

/**
 * The outline of the page — the stored tree, shown as a tree.
 *
 * Useful for its own sake on a long page, and it happens to be the most direct
 * possible view of what the database actually holds: a nested list of component
 * names. Selecting here selects on the canvas, and dragging here reorders.
 */
import { getSchema } from "@/lib/registry";
import type { PageNode, ResolvedComponent } from "@/lib/registry/types";
import { useEditor } from "@/lib/editor/store";
import { componentIdOf, isComponentRef } from "@/lib/shared-components";
import { cx } from "../ui";
import { useTechnical } from "../technical";
import { DRAG_MOVE } from "./Canvas";

export function Layers({
  components = {},
}: {
  components?: Record<string, ResolvedComponent>;
}) {
  const body = useEditor((s) => s.body);
  const technical = useTechnical();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-800 px-4 py-3">
        <p className="text-[12px] font-medium text-ink-200">Page outline</p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
          Everything on this page, in order. Drag to reorder. A{" "}
          <span className="font-medium text-reuse-500">◈ reusable block</span> shows as a single
          item — the page just points at it.
          {technical && (
            <span className="mt-1 block font-mono text-ink-600">
              This is the stored tree — the literal contents of the draft row.
            </span>
          )}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {body.root.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-ink-500">
            The page is empty.
          </p>
        ) : (
          <Branch nodes={body.root} parentId={null} depth={0} components={components} />
        )}
      </div>
    </div>
  );
}

function Branch({
  nodes,
  parentId,
  depth,
  components,
}: {
  nodes: PageNode[];
  parentId: string | null;
  depth: number;
  components: Record<string, ResolvedComponent>;
}) {
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const hover = useEditor((s) => s.hover);
  const moveNode = useEditor((s) => s.moveNode);

  return (
    <ul>
      {nodes.map((node, i) => {
        const schema = getSchema(node.type);
        const selected = node.id === selectedId;
        const instance = isComponentRef(node);
        const definition = instance ? components[componentIdOf(node) ?? ""] : undefined;
        const label = instance ? "" : summarise(node);
        return (
          <li key={node.id}>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = e.dataTransfer.getData(DRAG_MOVE);
                if (id && id !== node.id) moveNode(id, parentId, i);
              }}
              className="h-1"
            />
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData(DRAG_MOVE, node.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => select(node.id)}
              onMouseEnter={() => hover(node.id)}
              onMouseLeave={() => hover(null)}
              style={{ paddingLeft: `${8 + depth * 14}px` }}
              className={cx(
                "flex w-full cursor-grab items-center gap-2 rounded-md py-1.5 pr-2 text-left transition-colors active:cursor-grabbing",
                selected ? "bg-flux-500/15 text-ink-100" : "text-ink-300 hover:bg-ink-850",
              )}
            >
              <span
                className={cx(
                  "w-4 shrink-0 text-center text-[11px]",
                  instance ? "text-reuse-500" : "text-ink-500",
                )}
              >
                {instance ? "◈" : (schema?.icon ?? "?")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px]">
                <span className={cx("font-medium", instance && "text-reuse-500")}>
                  {instance
                    ? (definition?.name ?? "Deleted block")
                    : (schema?.label ?? node.type)}
                </span>
                {label && <span className="ml-1.5 text-ink-500">{label}</span>}
                {instance && <span className="ml-1.5 text-ink-500">reused</span>}
              </span>
            </button>
            {/* An instance's children live in the component, not on this page. */}
            {!instance && node.children?.length ? (
              <Branch
                nodes={node.children}
                parentId={node.id}
                depth={depth + 1}
                components={components}
              />
            ) : null}
          </li>
        );
      })}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = e.dataTransfer.getData(DRAG_MOVE);
          if (id) moveNode(id, parentId, nodes.length);
        }}
        className="h-2"
      />
    </ul>
  );
}

/** A short preview of the block's content, so the outline is readable. */
function summarise(node: PageNode): string {
  const candidate =
    node.props.headline ?? node.props.text ?? node.props.heading ?? node.props.title ?? node.props.label;
  if (typeof candidate === "string" && candidate.trim()) {
    return `“${candidate.slice(0, 22)}${candidate.length > 22 ? "…" : ""}”`;
  }
  return "";
}
