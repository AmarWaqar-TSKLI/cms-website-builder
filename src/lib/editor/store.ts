"use client";

/**
 * EDITOR STATE — Zustand, entirely local.
 *
 * Every interaction (add, select, edit a prop, reorder, delete) mutates this
 * store and nothing else. No await, no spinner, no network. The canvas is a
 * pure function of this tree, so editing feels instant because it IS instant.
 *
 * The network shows up in exactly one place: a debounced autosave that ships
 * the whole tree to page_drafts. Persistence is a background concern, not
 * something the interface waits on.
 */
import { create } from "zustand";
import { createNode, findNode, walk } from "../registry";
import type { PageBody, PageNode } from "../registry/types";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed" | "conflict";

interface EditorState {
  pageId: string;
  body: PageBody;
  selectedId: string | null;
  lockVersion: number;
  status: SaveStatus;
  lastSavedAt: number | null;
  lastError: string | null;
  /** Counts autosaves this session — the walkthrough shows this next to the row count. */
  saveCount: number;

  init: (pageId: string, body: PageBody, lockVersion: number) => void;
  select: (id: string | null) => void;
  addNode: (type: string, atIndex?: number) => void;
  updateProp: (id: string, key: string, value: unknown) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, direction: -1 | 1) => void;
  duplicateNode: (id: string) => void;

  setStatus: (status: SaveStatus, error?: string | null) => void;
  markSaved: (lockVersion: number) => void;
}

let idCounter = 0;
/** Node ids only need to be unique within a page body. */
function nextId(): string {
  idCounter += 1;
  return `n${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/** Highest existing numeric suffix, so ids stay unique after a reload. */
function seedCounter(body: PageBody) {
  let max = 0;
  walk(body.root ?? [], (n) => {
    const m = /(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, Number(m[1]));
  });
  idCounter = max;
}

export const useEditor = create<EditorState>((set, get) => ({
  pageId: "",
  body: { version: 1, root: [] },
  selectedId: null,
  lockVersion: 0,
  status: "idle",
  lastSavedAt: null,
  lastError: null,
  saveCount: 0,

  init: (pageId, body, lockVersion) => {
    seedCounter(body);
    set({
      pageId,
      body: { version: 1, root: body.root ?? [] },
      lockVersion,
      selectedId: null,
      status: "idle",
      lastError: null,
    });
  },

  select: (id) => set({ selectedId: id }),

  addNode: (type, atIndex) =>
    set((state) => {
      const node = createNode(type, nextId());
      const root = [...state.body.root];
      const index = atIndex ?? root.length;
      root.splice(index, 0, node);
      return {
        body: { ...state.body, root },
        selectedId: node.id,
        status: "dirty" as SaveStatus,
      };
    }),

  updateProp: (id, key, value) =>
    set((state) => {
      // Structural clone so the canvas re-renders; bodies are small enough that
      // copying the whole tree per keystroke costs nothing measurable.
      const root = structuredClone(state.body.root) as PageNode[];
      const node = findNode(root, id);
      if (!node) return state;
      node.props[key] = value;
      return { body: { ...state.body, root }, status: "dirty" as SaveStatus };
    }),

  removeNode: (id) =>
    set((state) => {
      const prune = (nodes: PageNode[]): PageNode[] =>
        nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: prune(n.children ?? []) }));
      return {
        body: { ...state.body, root: prune(state.body.root) },
        selectedId: state.selectedId === id ? null : state.selectedId,
        status: "dirty" as SaveStatus,
      };
    }),

  moveNode: (id, direction) =>
    set((state) => {
      const root = [...state.body.root];
      const index = root.findIndex((n) => n.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= root.length) return state;
      [root[index], root[target]] = [root[target], root[index]];
      return { body: { ...state.body, root }, status: "dirty" as SaveStatus };
    }),

  duplicateNode: (id) =>
    set((state) => {
      const root = [...state.body.root];
      const index = root.findIndex((n) => n.id === id);
      if (index === -1) return state;
      const copy = structuredClone(root[index]) as PageNode;
      const reid = (n: PageNode) => {
        n.id = nextId();
        (n.children ?? []).forEach(reid);
      };
      reid(copy);
      root.splice(index + 1, 0, copy);
      return { body: { ...state.body, root }, selectedId: copy.id, status: "dirty" as SaveStatus };
    }),

  setStatus: (status, error = null) => set({ status, lastError: error }),

  markSaved: (lockVersion) =>
    set((state) => ({
      lockVersion,
      status: "saved",
      lastSavedAt: Date.now(),
      lastError: null,
      saveCount: state.saveCount + 1,
    })),
}));

export function selectedNode(): PageNode | null {
  const { body, selectedId } = useEditor.getState();
  if (!selectedId) return null;
  return findNode(body.root, selectedId) ?? null;
}
