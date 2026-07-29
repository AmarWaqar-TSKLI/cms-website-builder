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
import { useRouter } from "next/navigation";
import { getComponent, getSchema } from "@/lib/registry";
import type { PageNode, RenderContext, ThemeLayout } from "@/lib/registry/types";
import { useEditor } from "@/lib/editor/store";
import { componentIdOf, isComponentRef } from "@/lib/shared-components";
import { SiteFooter, SiteNav } from "../site/chrome";
import { cx } from "../ui";

export const DRAG_ADD = "application/x-cms-add";
export const DRAG_MOVE = "application/x-cms-move";
/** Dragging a shared component in carries its id, not a block type. */
export const DRAG_ADD_COMPONENT = "application/x-cms-add-component";

type Edge = "before" | "after" | null;

export function Canvas({
  ctx,
  layout,
  onEditChrome,
}: {
  ctx: RenderContext;
  /**
   * The site's nav + footer. When present (editing a page), they're drawn around
   * the page just like the live site — so the navbar is VISIBLE and obviously
   * yours, instead of silently living in the theme where nobody finds it. Omitted
   * when editing a reusable block, where site chrome would be a lie.
   */
  layout?: ThemeLayout;
  /** Click the nav or footer → jump to where they're edited (the Design tab). */
  onEditChrome?: () => void;
}) {
  const body = useEditor((s) => s.body);
  const select = useEditor((s) => s.select);

  // Already expanded. The store expands once, at init, and keeps the expanded
  // tree as the working document — see init() for why re-expanding on every
  // render would be wrong rather than merely wasteful.
  return (
    <div
      className="min-h-full bg-white"
      style={{ colorScheme: "light" }}
      onClick={() => select(null)}
    >
      {layout && (
        <EditableChrome part="nav" onEdit={onEditChrome}>
          <SiteNav layout={layout} tokens={ctx.tokens} />
        </EditableChrome>
      )}
      <NodeList nodes={body.root} parentId={null} ctx={ctx} />
      {layout && (
        <EditableChrome part="footer" onEdit={onEditChrome}>
          <SiteFooter layout={layout} tokens={ctx.tokens} />
        </EditableChrome>
      )}
    </div>
  );
}

/** Wraps the nav/footer so hovering shows it's editable and a click opens Design. */
function EditableChrome({
  children,
  onEdit,
  part,
}: {
  children: React.ReactNode;
  onEdit?: () => void;
  part: "nav" | "footer";
}) {
  return (
    <div
      className="group relative cursor-pointer"
      title={part === "nav" ? "Your navigation bar — click to edit it" : "Your footer — click to edit it"}
      onClick={(e) => {
        e.stopPropagation();
        onEdit?.();
      }}
    >
      {/* The chrome itself is inert; clicks belong to the wrapper. */}
      <div className="pointer-events-none">{children}</div>
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="absolute inset-0 bg-flux-500/[0.06] shadow-[inset_0_0_0_1.5px_var(--color-flux-500)]" />
        <span className="absolute right-2 top-2 rounded-md bg-flux-500 px-2 py-0.5 text-[10px] font-medium text-white">
          {part === "nav" ? "Navigation bar — click to edit" : "Footer — click to edit"}
        </span>
      </div>
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
        // A whole blank page gets room to breathe and a proper welcome; an empty
        // Columns cell just needs a small, obvious target.
        minHeight: inline ? 120 : parentId === null ? 300 : 140,
        outline: active ? "2px dashed var(--color-flux-500)" : "1px dashed #d4d4d8",
        outlineOffset: -2,
      }}
    >
      {parentId === null && !inline ? (
        // The blank-page moment — the single most disorienting one for someone
        // new — so it coaches rather than just labels. Only ever shows on a page
        // with zero blocks, so it is contextual, never furniture.
        <div className="pointer-events-none flex max-w-xs flex-col items-center gap-1.5 px-6 text-center">
          <span aria-hidden className="text-[22px] text-neutral-300">＋</span>
          <span className="text-[14px] font-semibold text-neutral-500">
            {active ? "Drop it here" : "Your page is empty"}
          </span>
          <span className="text-[12px] leading-relaxed text-neutral-400">
            Drag a block from the left onto the page, or just click one to add it. A{" "}
            <span className="font-medium text-neutral-500">Hero</span> or{" "}
            <span className="font-medium text-neutral-500">Heading</span> is a good place to start.
          </span>
        </div>
      ) : (
        <span className="pointer-events-none text-[12px] font-medium text-neutral-400">
          {active ? "Drop here" : "Drag a block here"}
        </span>
      )}
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
  const isShared = useEditor((s) => s.isShared);
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

  // THE distinction, now that every block is a component. A component used by
  // ONE page is simply this page's block: edit it in place and the edit is
  // saved back into it. A component used by SEVERAL pages is shared, so the
  // same gesture would change pages you are not looking at — those become an
  // override instead, and the block is not structurally editable from here.
  const ownerShared = isShared(owned?.componentId);
  const instanceShared = isInstance && isShared(componentIdOf(node));
  const locked = !!owned && ownerShared;
  const definition = isInstance
    ? ctx.components?.[componentIdOf(node) ?? ""]
    : undefined;
  /** Clicks inside a SHARED component resolve up to the instance that owns it. */
  const addressableId = locked ? (owned?.instanceId ?? node.id) : node.id;

  const selected = !locked && node.id === selectedId;
  const hovered = !locked && node.id === hoveredId && !selected;

  /**
   * The whole block is a drop target. Which half the pointer is in decides
   * whether the dropped block lands above or below — far more forgiving than
   * asking someone to hit a thin gap.
   */
  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (locked) return; // inside a SHARED component: the instance frame handles it
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const past = inline
        ? e.clientX > rect.left + rect.width / 2
        : e.clientY > rect.top + rect.height / 2;
      setEdge(past ? "after" : "before");
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_ADD) ? "copy" : "move";
    },
    [inline, locked],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (locked) return;
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
    [edge, index, parentId, node.id, addNode, addComponentRef, moveNode, locked],
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
      target.style.outline = "2px solid var(--color-flux-500)";
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
        // The whole rule. Text inside a SHARED component becomes an override on
        // this page, because editing the component would change pages nobody
        // here can see. Text inside a component only this page uses is just this
        // page's text — edit it directly, and decompose() saves it back into it.
        if (locked) setOverride(owned!.instanceId, owned!.overrideKey, propName, value);
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
    [node.id, node.props, schema, updateProp, setOverride, owned, locked],
  );

  if (!entry) {
    return (
      <div className="p-6 text-center text-xs text-fail-500">
        This block can’t be shown here.
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
        // Only a SHARED component is read-only. A component this page owns is
        // just this page's block, so you can drop into its containers freely.
        readOnly={instanceShared || locked}
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
      draggable={!editing && !locked}
      onDragStart={(e) => {
        if (locked) return;
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
          ? instanceShared
            ? "shadow-[inset_0_0_0_2px_var(--color-reuse-500)]"
            : "shadow-[inset_0_0_0_2px_var(--color-flux-500)]"
          : hovered
            ? instanceShared
              ? "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-reuse-500)_55%,transparent)]"
              : "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-flux-500)_50%,transparent)]"
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
            "pointer-events-none absolute left-0 top-0 z-20 rounded-br-md px-2 py-0.5 text-[10px] font-medium text-white",
            instanceShared
              ? selected
                ? "bg-reuse-500"
                : "bg-reuse-500/60"
              : selected
                ? "bg-flux-500"
                : "bg-flux-500/60",
          )}
        >
          {instanceShared
            ? `◈ ${definition?.name ?? "Missing component"}`
            : (schema?.label ?? node.type)}
        </span>
      )}

      {selected && (
        // A labelled toolbar on the block itself, so "how do I move / copy /
        // reuse / delete this?" is answered where the eyes already are, in words
        // rather than mystery glyphs.
        <div
          className={cx(
            "absolute right-1.5 top-1.5 z-30 flex items-center gap-0.5 rounded-lg px-1 py-1 shadow-lg",
            instanceShared ? "bg-reuse-500" : "bg-flux-500",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {instanceShared && definition && (
            <>
              <BarBtn
                title="Edit this reusable block everywhere it appears"
                onClick={() => router.push(`/editor/component/${definition.id}`)}
              >
                Edit block
              </BarBtn>
              <BarBtn
                title="Stop reusing here — turn this into normal blocks only this page has"
                onClick={() => detachComponent(node.id, ctx.components ?? {})}
              >
                Unlink
              </BarBtn>
              <Sep />
            </>
          )}
          <BarBtn title="Move up" icon onClick={() => nudge(node.id, -1)}>↑</BarBtn>
          <BarBtn title="Move down" icon onClick={() => nudge(node.id, 1)}>↓</BarBtn>
          <BarBtn title="Make a copy of this block" onClick={() => duplicateNode(node.id)}>
            Duplicate
          </BarBtn>
          {!isInstance && (
            <BarBtn
              title="Reuse this block on other pages — edit it once and it updates everywhere"
              onClick={() => {
                select(node.id);
                window.dispatchEvent(new Event("cms:reuse-selected"));
              }}
            >
              Reuse
            </BarBtn>
          )}
          <Sep />
          <BarBtn title="Delete this block" danger onClick={() => removeNode(node.id)}>
            Delete
          </BarBtn>
        </div>
      )}

      {entry.render({ node, props: node.props ?? {}, ctx, children })}
    </div>
  );
}

function BarBtn({
  children,
  onClick,
  title,
  icon,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  /** A single-glyph button (arrows) — squared rather than text-width. */
  icon?: boolean;
  /** The destructive one gets a red hover so it reads as "careful". */
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx(
        "rounded-md px-2 py-1 text-[12px] font-medium leading-none text-white/90 transition-colors",
        icon && "grid h-6 w-6 place-items-center px-0 text-[13px]",
        danger ? "hover:bg-fail-500 hover:text-white" : "hover:bg-white/25 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-white/30" />;
}
