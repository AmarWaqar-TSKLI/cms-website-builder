"use client";

/**
 * The canvas.
 *
 * This resolves node types through the SAME registry the build worker uses and
 * calls the SAME pure render functions. There is no editor-specific preview
 * implementation to drift out of sync — what you are looking at is the artifact,
 * minus the selection chrome.
 *
 * Three interactions are layered on top without touching the components:
 *   - every block is itself a drop target: hovering its top half inserts above,
 *     its bottom half below, with a line showing exactly where it will land
 *   - double-clicking any text the schema marked `inlineEditable` edits it in
 *     place, via delegation on the `data-cms-prop` attributes the components
 *     already emit
 *   - a floating toolbar on the selected block
 */
import { useCallback, useRef, useState } from "react";
import { getComponent, getSchema } from "@/lib/registry";
import type { PageNode, RenderContext } from "@/lib/registry/types";
import { useEditor } from "@/lib/editor/store";
import { cx } from "../ui";

export const DRAG_ADD = "application/x-cms-add";
export const DRAG_MOVE = "application/x-cms-move";

type Edge = "before" | "after" | null;

export function Canvas({ ctx }: { ctx: RenderContext }) {
  const body = useEditor((s) => s.body);
  const select = useEditor((s) => s.select);

  return (
    <div
      className="min-h-full bg-white"
      style={{ colorScheme: "light" }}
      onClick={() => select(null)}
    >
      <NodeList nodes={body.root} parentId={null} ctx={ctx} />
    </div>
  );
}

function NodeList({
  nodes,
  parentId,
  ctx,
  inline,
}: {
  nodes: PageNode[];
  parentId: string | null;
  ctx: RenderContext;
  /** Columns lay children out horizontally, so the insertion line is vertical. */
  inline?: boolean;
}) {
  // An empty container still needs somewhere to aim at.
  if (nodes.length === 0) {
    return <EmptyDropZone parentId={parentId} inline={inline} />;
  }
  return (
    <>
      {nodes.map((node, i) => (
        <NodeFrame
          key={node.id}
          node={node}
          index={i}
          parentId={parentId}
          ctx={ctx}
          inline={inline}
        />
      ))}
    </>
  );
}

function EmptyDropZone({ parentId, inline }: { parentId: string | null; inline?: boolean }) {
  const [active, setActive] = useState(false);
  const addNode = useEditor((s) => s.addNode);
  const moveNode = useEditor((s) => s.moveNode);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setActive(false);
        const type = e.dataTransfer.getData(DRAG_ADD);
        if (type) return addNode(type, parentId, 0);
        const id = e.dataTransfer.getData(DRAG_MOVE);
        if (id) moveNode(id, parentId, 0);
      }}
      className={cx(
        "grid place-items-center transition-colors",
        active ? "bg-flux-500/10" : "bg-neutral-50",
      )}
      style={{
        minHeight: inline ? 120 : 140,
        outline: active ? "2px dashed #6d5cff" : "1px dashed #d4d4d8",
        outlineOffset: -2,
      }}
    >
      <span className="pointer-events-none text-[12px] font-medium text-neutral-400">
        {active ? "Drop here" : "Drag a block here"}
      </span>
    </div>
  );
}

function NodeFrame({
  node,
  index,
  parentId,
  ctx,
  inline,
}: {
  node: PageNode;
  index: number;
  parentId: string | null;
  ctx: RenderContext;
  inline?: boolean;
}) {
  const selectedId = useEditor((s) => s.selectedId);
  const hoveredId = useEditor((s) => s.hoveredId);
  const select = useEditor((s) => s.select);
  const hover = useEditor((s) => s.hover);
  const updateProp = useEditor((s) => s.updateProp);
  const removeNode = useEditor((s) => s.removeNode);
  const duplicateNode = useEditor((s) => s.duplicateNode);
  const nudge = useEditor((s) => s.nudge);
  const addNode = useEditor((s) => s.addNode);
  const moveNode = useEditor((s) => s.moveNode);

  const [editing, setEditing] = useState(false);
  const [edge, setEdge] = useState<Edge>(null);
  const ref = useRef<HTMLDivElement>(null);

  const entry = getComponent(node.type);
  const schema = getSchema(node.type);
  const selected = node.id === selectedId;
  const hovered = node.id === hoveredId && !selected;

  /**
   * The whole block is a drop target. Which half the pointer is in decides
   * whether the dropped block lands above or below — far more forgiving than
   * asking someone to hit a thin gap.
   */
  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const past = inline
        ? e.clientX > rect.left + rect.width / 2
        : e.clientY > rect.top + rect.height / 2;
      setEdge(past ? "after" : "before");
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_ADD) ? "copy" : "move";
    },
    [inline],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const at = edge === "after" ? index + 1 : index;
      setEdge(null);

      const type = e.dataTransfer.getData(DRAG_ADD);
      if (type) return addNode(type, parentId, at);

      const id = e.dataTransfer.getData(DRAG_MOVE);
      if (id && id !== node.id) moveNode(id, parentId, at);
    },
    [edge, index, parentId, node.id, addNode, moveNode],
  );

  /**
   * Inline editing by delegation. The components already tag their text with
   * data-cms-prop for exactly this; the editor does not need a special
   * "editable" variant of every component.
   */
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-cms-prop]") as HTMLElement | null;
      if (!target || !ref.current?.contains(target)) return;
      const propName = target.getAttribute("data-cms-prop")!;
      if (!schema?.props[propName]?.inlineEditable) return;

      e.stopPropagation();
      e.preventDefault();
      setEditing(true);
      target.contentEditable = "plaintext-only";
      target.style.outline = "2px solid #6d5cff";
      target.style.outlineOffset = "2px";
      target.focus();

      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      const finish = () => {
        target.contentEditable = "false";
        target.style.outline = "";
        target.removeEventListener("blur", finish);
        target.removeEventListener("keydown", onKey);
        setEditing(false);
        const value = target.innerText.replace(/ /g, " ");
        if (value !== String(node.props[propName] ?? "")) updateProp(node.id, propName, value);
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          target.innerText = String(node.props[propName] ?? "");
          target.blur();
        }
        // Enter commits single-line fields; textareas keep their newlines.
        if (ev.key === "Enter" && schema.props[propName].kind !== "textarea") {
          ev.preventDefault();
          target.blur();
        }
      };
      target.addEventListener("blur", finish);
      target.addEventListener("keydown", onKey);
    },
    [node.id, node.props, schema, updateProp],
  );

  if (!entry) {
    return (
      <div className="p-6 text-center font-mono text-xs text-red-500">
        Unknown component “{node.type}”
      </div>
    );
  }

  // Containers render their children through the editor's own list, so blocks
  // can be dropped inside them too.
  const children = schema?.acceptsChildren ? (
    <NodeList nodes={node.children ?? []} parentId={node.id} ctx={ctx} inline />
  ) : undefined;

  const line = inline
    ? "absolute top-0 bottom-0 w-[3px] bg-flux-500 z-30"
    : "absolute left-0 right-0 h-[3px] bg-flux-500 z-30";

  return (
    <div
      ref={ref}
      data-cms-node={node.id}
      data-cms-type={node.type}
      draggable={!editing}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData(DRAG_MOVE, node.id);
        e.dataTransfer.effectAllowed = "move";
        select(node.id);
      }}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        e.stopPropagation();
        setEdge(null);
      }}
      onDrop={onDrop}
      onDragEnd={() => setEdge(null)}
      onClick={(e) => {
        e.stopPropagation();
        select(node.id);
      }}
      onDoubleClick={onDoubleClick}
      onMouseOver={(e) => {
        e.stopPropagation();
        hover(node.id);
      }}
      onMouseOut={() => hover(null)}
      className={cx(
        "relative outline-none transition-shadow",
        selected
          ? "shadow-[inset_0_0_0_2px_#6d5cff]"
          : hovered
            ? "shadow-[inset_0_0_0_1px_rgba(109,92,255,.5)]"
            : "",
      )}
    >
      {edge && (
        <span
          className={line}
          style={
            inline
              ? edge === "before"
                ? { left: -2 }
                : { right: -2 }
              : edge === "before"
                ? { top: -2 }
                : { bottom: -2 }
          }
        />
      )}

      {(selected || hovered) && (
        <span
          className={cx(
            "pointer-events-none absolute left-0 top-0 z-20 rounded-br-md px-2 py-0.5 font-mono text-[10px] font-medium text-white",
            selected ? "bg-flux-500" : "bg-flux-500/60",
          )}
        >
          {schema?.label ?? node.type}
        </span>
      )}

      {selected && (
        <div
          className="absolute right-0 top-0 z-20 flex items-center gap-0.5 rounded-bl-md bg-flux-500 px-1 py-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <ToolbarButton title="Move up" onClick={() => nudge(node.id, -1)}>↑</ToolbarButton>
          <ToolbarButton title="Move down" onClick={() => nudge(node.id, 1)}>↓</ToolbarButton>
          <ToolbarButton title="Duplicate" onClick={() => duplicateNode(node.id)}>⧉</ToolbarButton>
          <ToolbarButton title="Delete" onClick={() => removeNode(node.id)}>✕</ToolbarButton>
        </div>
      )}

      {entry.render({ node, props: node.props ?? {}, ctx, children })}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid h-5 w-5 place-items-center rounded text-[11px] leading-none text-white/90 transition-colors hover:bg-white/25 hover:text-white"
    >
      {children}
    </button>
  );
}
