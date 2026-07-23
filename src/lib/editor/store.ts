"use client";

/**
 * EDITOR STATE — Zustand, entirely local.
 *
 * Every interaction (add, select, edit a prop, drag, delete, undo) mutates this
 * store and nothing else. No await, no spinner, no network. The canvas is a
 * pure function of this tree, so editing feels instant because it IS instant.
 *
 * The network shows up in exactly one place: a debounced autosave that ships
 * the whole tree to page_drafts. Persistence is a background concern, not
 * something the interface waits on.
 *
 * Undo is trivially cheap here for the same reason versioning is: the document
 * is a small immutable tree, so keeping the previous roots around costs almost
 * nothing. The same property that makes page_revisions affordable makes Ctrl+Z
 * affordable.
 */
import { create } from "zustand";
import {
  cloneWithNewIds,
  createComponentRef,
  createNode,
  findNode,
  insertIntoTree,
  isAncestor,
  locate,
  removeFromTree,
  walk,
} from "../registry";
import { componentIdOf, overridesOf, stripExpansion } from "../shared-components";
import type { PageBody, PageNode, ResolvedSharedComponent } from "../registry/types";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed" | "conflict";

const HISTORY_LIMIT = 100;

/**
 * What this editor session is editing. A page and a shared component are edited
 * with the same canvas, the same palette and the same undo stack — the only
 * difference is which draft endpoint autosave writes to.
 */
export type EditTarget = "page" | "component";

interface EditorState {
  /** The draft being edited. Named pageId for continuity; see `target`. */
  pageId: string;
  target: EditTarget;
  body: PageBody;
  selectedId: string | null;
  hoveredId: string | null;
  lockVersion: number;
  status: SaveStatus;
  lastSavedAt: number | null;
  lastError: string | null;
  saveCount: number;

  past: PageNode[][];
  future: PageNode[][];

  init: (pageId: string, body: PageBody, lockVersion: number, target?: EditTarget) => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;

  addNode: (type: string, parentId?: string | null, index?: number) => void;
  addComponentRef: (componentId: string, parentId?: string | null, index?: number) => void;
  replaceWithComponentRef: (nodeId: string, componentId: string) => void;
  setOverride: (instanceId: string, innerId: string, key: string, value: unknown) => void;
  clearOverrides: (instanceId: string) => void;
  detachComponent: (instanceId: string, definition: ResolvedSharedComponent) => void;
  updateProp: (id: string, key: string, value: unknown) => void;
  updateProps: (id: string, patch: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  moveNode: (id: string, parentId: string | null, index: number) => void;
  nudge: (id: string, direction: -1 | 1) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  setStatus: (status: SaveStatus, error?: string | null) => void;
  markSaved: (lockVersion: number) => void;
}

let idCounter = 0;
export function nextId(): string {
  idCounter += 1;
  return `n${Date.now().toString(36)}${idCounter.toString(36)}`;
}

function seedCounter(body: PageBody) {
  let max = 0;
  walk(body.root ?? [], (n) => {
    const m = /(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, Number(m[1]));
  });
  idCounter = max;
}

export const useEditor = create<EditorState>((set, get) => {
  /** Every structural change goes through here, so undo is never forgotten. */
  const commit = (state: EditorState, root: PageNode[], extra: Partial<EditorState> = {}) => ({
    body: { ...state.body, root },
    past: [...state.past, state.body.root].slice(-HISTORY_LIMIT),
    future: [],
    status: "dirty" as SaveStatus,
    ...extra,
  });

  return {
    pageId: "",
    target: "page",
    body: { version: 1, root: [] },
    selectedId: null,
    hoveredId: null,
    lockVersion: 0,
    status: "idle",
    lastSavedAt: null,
    lastError: null,
    saveCount: 0,
    past: [],
    future: [],

    init: (pageId, body, lockVersion, target = "page") => {
      seedCounter(body);
      set({
        pageId,
        target,
        body: { version: 1, root: body.root ?? [] },
        lockVersion,
        selectedId: null,
        hoveredId: null,
        status: "idle",
        lastError: null,
        past: [],
        future: [],
      });
    },

    select: (id) => set({ selectedId: id }),
    hover: (id) => set({ hoveredId: id }),

    addNode: (type, parentId = null, index) =>
      set((state) => {
        const node = createNode(type, nextId());
        const at =
          index ??
          (parentId === null
            ? state.body.root.length
            : (findNode(state.body.root, parentId)?.children ?? []).length);
        return commit(state, insertIntoTree(state.body.root, node, parentId, at), {
          selectedId: node.id,
        });
      }),

    /**
     * Insert an instance of a shared component.
     *
     * Note what is not copied: nothing. The node is a pointer, which is the
     * entire reason editing the symbol later changes this page too.
     */
    addComponentRef: (componentId, parentId = null, index) =>
      set((state) => {
        const node = createComponentRef(componentId, nextId());
        const at =
          index ??
          (parentId === null
            ? state.body.root.length
            : (findNode(state.body.root, parentId)?.children ?? []).length);
        return commit(state, insertIntoTree(state.body.root, node, parentId, at), {
          selectedId: node.id,
        });
      }),

    /**
     * The second half of "Make component": swap a block for a reference to the
     * definition just created from it. Same position, same parent — visually
     * nothing moves, which is exactly what should happen when the content is
     * identical and only its ownership changed.
     */
    replaceWithComponentRef: (nodeId, componentId) =>
      set((state) => {
        const where = locate(state.body.root, nodeId);
        if (!where) return state;
        const { tree } = removeFromTree(state.body.root, nodeId);
        const ref = createComponentRef(componentId, nextId());
        return commit(state, insertIntoTree(tree, ref, where.parentId, where.index), {
          selectedId: ref.id,
        });
      }),

    /**
     * Override one prop of one node inside one instance.
     *
     * Keyed by the node's id INSIDE the symbol, so the override survives the
     * symbol being restyled or reordered. It does not survive that node being
     * deleted from the symbol — which is correct, and the only rule that doesn't
     * silently accumulate overrides pointing at nothing.
     */
    setOverride: (instanceId, innerId, key, value) =>
      set((state) => {
        const root = structuredClone(state.body.root) as PageNode[];
        const instance = findNode(root, instanceId);
        if (!instance) return state;

        const overrides = { ...overridesOf(instance) };
        overrides[innerId] = { ...(overrides[innerId] ?? {}), [key]: value };
        instance.props.overrides = overrides;

        // Same keystroke coalescing as updateProp — typing over an instance's
        // heading shouldn't leave one undo entry per character.
        const key2 = `${instanceId}:${innerId}:${key}`;
        const coalesce = lastEditKey === key2 && Date.now() - lastEditAt < 900;
        lastEditKey = key2;
        lastEditAt = Date.now();
        if (coalesce) {
          return { body: { ...state.body, root }, status: "dirty" as SaveStatus };
        }
        return commit(state, root);
      }),

    /** Drop every override, so this instance shows the symbol exactly as defined. */
    clearOverrides: (instanceId) =>
      set((state) => {
        const root = structuredClone(state.body.root) as PageNode[];
        const instance = findNode(root, instanceId);
        if (!instance) return state;
        instance.props.overrides = {};
        lastEditKey = null;
        return commit(state, root);
      }),

    /**
     * Detach — replace an instance with a normal, editable copy of its content.
     *
     * The escape hatch that makes symbols safe to adopt. One page needs the
     * header slightly different; detaching gives it plain blocks it fully owns,
     * with overrides baked in, and it stops tracking the symbol from then on.
     * `stripExpansion` matters here: what gets inserted must be storable page
     * nodes, not render-time provenance.
     */
    detachComponent: (instanceId, definition) =>
      set((state) => {
        const instance = findNode(state.body.root, instanceId);
        const where = locate(state.body.root, instanceId);
        if (!instance || !where) return state;

        const overrides = overridesOf(instance);
        const copies = stripExpansion(definition.root ?? []).map((node) =>
          cloneWithNewIds(applyOverrides(node, overrides), nextId),
        );

        const { tree } = removeFromTree(state.body.root, instanceId);
        let next = tree;
        copies.forEach((node, i) => {
          next = insertIntoTree(next, node, where.parentId, where.index + i);
        });

        return commit(state, next, { selectedId: copies[0]?.id ?? null });
      }),

    updateProp: (id, key, value) =>
      set((state) => {
        const root = structuredClone(state.body.root) as PageNode[];
        const node = findNode(root, id);
        if (!node) return state;
        node.props[key] = value;
        // Typing into a text field shouldn't push one history entry per
        // keystroke; coalesce consecutive edits to the same prop of the same node.
        const key2 = `${id}:${key}`;
        const coalesce = lastEditKey === key2 && Date.now() - lastEditAt < 900;
        lastEditKey = key2;
        lastEditAt = Date.now();
        if (coalesce) {
          return { body: { ...state.body, root }, status: "dirty" as SaveStatus };
        }
        return commit(state, root);
      }),

    updateProps: (id, patch) =>
      set((state) => {
        const root = structuredClone(state.body.root) as PageNode[];
        const node = findNode(root, id);
        if (!node) return state;
        Object.assign(node.props, patch);
        lastEditKey = null;
        return commit(state, root);
      }),

    removeNode: (id) =>
      set((state) => {
        const { tree } = removeFromTree(state.body.root, id);
        return commit(state, tree, {
          selectedId: state.selectedId === id ? null : state.selectedId,
        });
      }),

    duplicateNode: (id) =>
      set((state) => {
        const node = findNode(state.body.root, id);
        const where = locate(state.body.root, id);
        if (!node || !where) return state;
        const copy = cloneWithNewIds(node, nextId);
        return commit(
          state,
          insertIntoTree(state.body.root, copy, where.parentId, where.index + 1),
          { selectedId: copy.id },
        );
      }),

    moveNode: (id, parentId, index) =>
      set((state) => {
        // Refuse to drop a container inside itself.
        if (parentId && isAncestor(state.body.root, id, parentId)) return state;

        const from = locate(state.body.root, id);
        if (!from) return state;

        const { tree, removed } = removeFromTree(state.body.root, id);
        if (!removed) return state;

        // Removing an earlier sibling shifts the target index down by one.
        let target = index;
        if (from.parentId === parentId && from.index < index) target -= 1;

        return commit(state, insertIntoTree(tree, removed, parentId, target), {
          selectedId: id,
        });
      }),

    nudge: (id, direction) =>
      set((state) => {
        const where = locate(state.body.root, id);
        if (!where) return state;
        const siblings =
          where.parentId === null
            ? state.body.root
            : (findNode(state.body.root, where.parentId)?.children ?? []);
        const target = where.index + direction;
        if (target < 0 || target >= siblings.length) return state;

        const { tree, removed } = removeFromTree(state.body.root, id);
        if (!removed) return state;
        return commit(state, insertIntoTree(tree, removed, where.parentId, target), {
          selectedId: id,
        });
      }),

    undo: () =>
      set((state) => {
        if (state.past.length === 0) return state;
        const previous = state.past[state.past.length - 1];
        lastEditKey = null;
        return {
          body: { ...state.body, root: previous },
          past: state.past.slice(0, -1),
          future: [state.body.root, ...state.future].slice(0, HISTORY_LIMIT),
          status: "dirty" as SaveStatus,
        };
      }),

    redo: () =>
      set((state) => {
        if (state.future.length === 0) return state;
        const next = state.future[0];
        lastEditKey = null;
        return {
          body: { ...state.body, root: next },
          past: [...state.past, state.body.root].slice(-HISTORY_LIMIT),
          future: state.future.slice(1),
          status: "dirty" as SaveStatus,
        };
      }),

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    setStatus: (status, error = null) => set({ status, lastError: error }),

    markSaved: (lockVersion) =>
      set((state) => ({
        lockVersion,
        status: "saved",
        lastSavedAt: Date.now(),
        lastError: null,
        saveCount: state.saveCount + 1,
      })),
  };
});

// Keystroke coalescing for undo. Module-level because it is a detail of how
// history is recorded, not part of the document.
let lastEditKey: string | null = null;
let lastEditAt = 0;

/** Bake an instance's overrides into a copy of the symbol's tree, for detach. */
function applyOverrides(
  node: PageNode,
  overrides: Record<string, Record<string, unknown>>,
): PageNode {
  const patch = overrides[node.id];
  return {
    ...node,
    props: patch ? { ...node.props, ...patch } : { ...node.props },
    children: (node.children ?? []).map((c) => applyOverrides(c, overrides)),
  };
}

/** The instance a selected node belongs to, if any — used by the properties panel. */
export function componentInstanceIdOf(node: PageNode | null): string | null {
  return node?.fromComponent?.instanceId ?? null;
}

export { componentIdOf };

export function selectedNode(): PageNode | null {
  const { body, selectedId } = useEditor.getState();
  if (!selectedId) return null;
  return findNode(body.root, selectedId) ?? null;
}
