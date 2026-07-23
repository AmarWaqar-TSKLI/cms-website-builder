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
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getComponent, getSchema } from "@/lib/registry";
import type { PageNode, RenderContext } from "@/lib/registry/types";
import { useEditor } from "@/lib/editor/store";
import { componentIdOf, expandComponents, isComponentRef } from "@/lib/shared-components";
import { cx } from "../ui";

export const DRAG_ADD = "application/x-cms-add";
export const DRAG_MOVE = "application/x-cms-move";
/** Dragging a shared component in carries its id, not a block type. */
export const DRAG_ADD_COMPONENT = "application/x-cms-add-component";

type Edge = "before" | "after" | null;

export function Canvas({ ctx }: { ctx: RenderContext }) {
  const body = useEditor((s) => s.body);
  const select = useEditor((s) => s.select);

  // The SAME expansion the build worker runs, against the symbols' current
  // drafts. Edit a header in its own tab and every page previewing it here shows
  // the change — because both sides call this one function.
  const expanded = useMemo(
    () => expandComponents(body.root, ctx.components ?? {}),
    [body.root, ctx.components],
  );

  return (
    <div
      className="min-h-full bg-white"
      style={{ colorScheme: "light" }}
      onClick={() => select(null)}
    >
      <NodeList nodes={expanded} parentId={null} ctx={ctx} />
    </div>
  );
}

function NodeList({
  nodes,
  parentId,
  ctx,
  inline,
  readOnly,
}: {
  nodes: PageNode[];
  parentId: string | null;
  ctx: RenderContext;
  /** Columns lay children out horizontally, so the insertion line is vertical. */
  inline?: boolean;
  /** Inside a symbol instance: no drop targets, because there is nothing to drop into. */
  readOnly?: boolean;
}) {
  // An empty container still needs somewhere to aim at — unless it belongs to a
  // symbol, where "drag a block here" would be a lie.
  if (nodes.length === 0) {
    return readOnly ? null : <EmptyDropZone parentId={parentId} inline={inline} />;
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
  const addComponentRef = useEditor((s) => s.addComponentRef);
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
        const componentId = e.dataTransfer.getData(DRAG_ADD_COMPONENT);
        if (componentId) return addComponentRef(componentId, parentId, 0);
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
  const setOverride = useEditor((s) => s.setOverride);
  const removeNode = useEditor((s) => s.removeNode);
  const duplicateNode = useEditor((s) => s.duplicateNode);
  const nudge = useEditor((s) => s.nudge);
  const addNode = useEditor((s) => s.addNode);
  const addComponentRef = useEditor((s) => s.addComponentRef);
  const moveNode = useEditor((s) => s.moveNode);
  const detachComponent = useEditor((s) => s.detachComponent);
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [edge, setEdge] = useState<Edge>(null);
  const ref = useRef<HTMLDivElement>(null);

  const entry = getComponent(node.type);
  const schema = getSchema(node.type);

  // ── Symbol ownership ────────────────────────────────────────────────────
  // A node expansion produced does not exist in the stored tree, so it cannot be
  // moved, deleted or duplicated — there is nothing there to move. Selection
  // resolves up to the instance instead, which keeps one invariant that removes
  // a whole class of bugs: `selectedId` always names a node that is really
  // stored. What such a node CAN do is take an override, and it does that
  // through the same double-click that edits an ordinary block.
  const owned = node.fromComponent;
  const isInstance = isComponentRef(node);
  const definition = isInstance
    ? ctx.components?.[componentIdOf(node) ?? ""]
    : undefined;
  /** Clicks and hovers inside a symbol resolve up to the instance that owns it. */
  const addressableId = owned?.instanceId ?? node.id;

  // Only nodes the page really owns draw their own chrome; everything inside a
  // symbol defers to the instance frame wrapping it.
  const selected = !owned && node.id === selectedId;
  const hovered = !owned && node.id === hoveredId && !selected;

  /**
   * The whole block is a drop target. Which half the pointer is in decides
   * whether the dropped block lands above or below — far more forgiving than
   * asking someone to hit a thin gap.
   */
  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (owned) return; // inside a symbol: let the instance frame handle it
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const past = inline
        ? e.clientX > rect.left + rect.width / 2
        : e.clientY > rect.top + rect.height / 2;
      setEdge(past ? "after" : "before");
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_ADD) ? "copy" : "move";
    },
    [inline, owned],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (owned) return;
      e.preventDefault();
      e.stopPropagation();
      const at = edge === "after" ? index + 1 : index;
      setEdge(null);

      const type = e.dataTransfer.getData(DRAG_ADD);
      if (type) return addNode(type, parentId, at);

      const componentId = e.dataTransfer.getData(DRAG_ADD_COMPONENT);
      if (componentId) return addComponentRef(componentId, parentId, at);

      const id = e.dataTransfer.getData(DRAG_MOVE);
      if (id && id !== node.id) moveNode(id, parentId, at);
    },
    [edge, index, parentId, node.id, addNode, addComponentRef, moveNode, owned],
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
        if (value === String(node.props[propName] ?? "")) return;

        // Typing over text that belongs to a symbol does NOT edit the symbol —
        // that would silently change every other page using it. It records an
        // override on THIS instance, keyed by the node's id inside the symbol.
        // Changing the symbol for everyone is a separate, deliberate act: open it.
        // `overrideKey`, not `innerId` — with nesting they differ, and only the
        // former names a node the page can actually find. See rebase().
        if (owned) setOverride(owned.instanceId, owned.overrideKey, propName, value);
        else updateProp(node.id, propName, value);
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
    [node.id, node.props, schema, updateProp, setOverride, owned],
  );

  if (!entry) {
    return (
      <div className="p-6 text-center font-mono text-xs text-red-500">
        Unknown component “{node.type}”
      </div>
    );
  }

  // Containers render their children through the editor's own list, so blocks
  // can be dropped inside them too. An instance also renders children — the
  // symbol's tree that expansion put there — but those are not droppable: to
  // change what is inside a symbol you edit the symbol.
  const children =
    schema?.acceptsChildren || isInstance ? (
      <NodeList
        nodes={node.children ?? []}
        parentId={node.id}
        ctx={ctx}
        inline={schema?.acceptsChildren ? true : undefined}
        readOnly={isInstance || !!owned}
      />
    ) : undefined;

  const line = inline
    ? "absolute top-0 bottom-0 w-[3px] bg-flux-500 z-30"
    : "absolute left-0 right-0 h-[3px] bg-flux-500 z-30";

  return (
    <div
      ref={ref}
      data-cms-node={node.id}
      data-cms-type={node.type}
      data-cms-instance={isInstance ? componentIdOf(node) ?? "unset" : undefined}
      data-cms-from-component={owned?.componentId}
      draggable={!editing && !owned}
      onDragStart={(e) => {
        if (owned) return;
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
        select(addressableId);
      }}
      onDoubleClick={onDoubleClick}
      onMouseOver={(e) => {
        e.stopPropagation();
        hover(addressableId);
      }}
      onMouseOut={() => hover(null)}
      className={cx(
        "relative outline-none transition-shadow",
        selected
          ? isInstance
            ? "shadow-[inset_0_0_0_2px_#22c7a9]"
            : "shadow-[inset_0_0_0_2px_#6d5cff]"
          : hovered
            ? isInstance
              ? "shadow-[inset_0_0_0_1px_rgba(34,199,169,.6)]"
              : "shadow-[inset_0_0_0_1px_rgba(109,92,255,.5)]"
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
            isInstance
              ? selected
                ? "bg-[#22c7a9]"
                : "bg-[#22c7a9]/60"
              : selected
                ? "bg-flux-500"
                : "bg-flux-500/60",
          )}
        >
          {isInstance ? `◈ ${definition?.name ?? "Missing component"}` : (schema?.label ?? node.type)}
        </span>
      )}

      {selected && (
        <div
          className={cx(
            "absolute right-0 top-0 z-20 flex items-center gap-0.5 rounded-bl-md px-1 py-0.5",
            isInstance ? "bg-[#22c7a9]" : "bg-flux-500",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {isInstance && definition && (
            <ToolbarButton
              title={`Edit “${definition.name}” — changes every page using it`}
              onClick={() => router.push(`/editor/component/${definition.id}`)}
            >
              ✎
            </ToolbarButton>
          )}
          {isInstance && definition && (
            <ToolbarButton
              title="Detach — turn this into ordinary blocks this page owns"
              onClick={() => detachComponent(node.id, ctx.components ?? {})}
            >
              ⛓
            </ToolbarButton>
          )}
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
