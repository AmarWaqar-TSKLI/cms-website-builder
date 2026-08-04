/**
 * The PURE half of branching: three-way diff between a fork-point baseline, the
 * parent as it is now, and the branch as it is now. No database access — the
 * DB-aware half (branch.ts) builds the inputs and applies the outputs, which is
 * what makes this logic unit-testable.
 *
 * Why three-way matters (the two-way diff had a silent bug): comparing only
 * parent-vs-branch cannot tell "the branch edited this" from "the PARENT moved
 * on after the fork". The first should merge; the second must not be quietly
 * reverted; both-at-once is a conflict a person has to resolve. The baseline —
 * captured at fork time (branch_baselines) — is what makes the distinction
 * computable. A branch forked before baselines existed degrades to the old
 * two-way behaviour rather than erroring.
 */
import { getSchema } from "./registry";
import type { PageBody, PageNode, ThemeTokens } from "./registry/types";
import { SHARED_COMPONENT_TYPE, componentIdOf } from "./shared-components";

/* ── flat shapes (JSON-safe: stored in branch_baselines and sent to the UI) ── */

export interface FlatBlock {
  type: string;
  /** text/textarea props only, per the registry schema. */
  text: Record<string, string>;
}
/** nodeId → block. Includes textless nodes — structure needs them. */
export type Blocks = Record<string, FlatBlock>;

/** Where a node sits: its component, its parent node ("" = component root), index. */
export interface NodePlace {
  componentId: string;
  parentNodeId: string;
  index: number;
  node: PageNode;
}

export interface BodyInput {
  componentId: string;
  root: PageNode[];
}

/** Text (and textarea) props of a node, per its registry schema. */
function textFieldsOf(node: PageNode): Record<string, string> {
  const schema = getSchema(node.type);
  if (!schema) return {};
  const out: Record<string, string> = {};
  for (const [k, def] of Object.entries(schema.props)) {
    if (def.kind === "text" || def.kind === "textarea") {
      const v = node.props?.[k];
      if (typeof v === "string" && v.trim()) out[k] = v;
    }
  }
  return out;
}

/** Every node across the given bodies: text map for diffing, place map for structure. */
export function indexBodies(bodies: BodyInput[]): {
  blocks: Blocks;
  places: Map<string, NodePlace>;
} {
  const blocks: Blocks = {};
  const places = new Map<string, NodePlace>();
  for (const { componentId, root } of bodies) {
    const walk = (nodes: PageNode[], parentNodeId: string) => {
      nodes.forEach((n, index) => {
        blocks[n.id] = { type: n.type, text: textFieldsOf(n) };
        places.set(n.id, { componentId, parentNodeId, index, node: n });
        if (n.children?.length) walk(n.children, n.id);
      });
    };
    walk(root ?? [], "");
  }
  return { blocks, places };
}

/* ── text diff ─────────────────────────────────────────────────────────────── */

export interface FieldChange {
  key: string;
  /** parent's current value — what merging would overwrite. */
  before: string;
  /** branch's value — what merging would write. */
  after: string;
  /** fork-point value, when a baseline exists. */
  base?: string;
  /** Both sides changed it since the fork, to different values. */
  conflict: boolean;
}
export interface ChangedBlock {
  nodeId: string;
  type: string;
  fields: FieldChange[];
  /** Any field conflicted → surface the whole block as needing a decision. */
  conflict: boolean;
}

export function diffTexts(base: Blocks | null, parent: Blocks, branch: Blocks): ChangedBlock[] {
  const out: ChangedBlock[] = [];
  for (const [id, b] of Object.entries(branch)) {
    const p = parent[id];
    if (!p) continue; // added — handled by the structural diff
    const baseText = base?.[id]?.text;
    const keys = new Set([...Object.keys(p.text), ...Object.keys(b.text)]);
    const fields: FieldChange[] = [];
    for (const key of keys) {
      const parentVal = p.text[key] ?? "";
      const branchVal = b.text[key] ?? "";
      if (parentVal === branchVal) continue;
      if (baseText) {
        const baseVal = baseText[key] ?? "";
        // The branch never touched it — the PARENT advanced. Not a branch
        // change; offering it would mean merging a silent revert.
        if (branchVal === baseVal) continue;
        const parentChangedToo = parentVal !== baseVal;
        fields.push({
          key,
          before: parentVal,
          after: branchVal,
          base: baseVal,
          conflict: parentChangedToo,
        });
      } else {
        fields.push({ key, before: parentVal, after: branchVal, conflict: false });
      }
    }
    if (fields.length) {
      out.push({ nodeId: id, type: b.type, fields, conflict: fields.some((f) => f.conflict) });
    }
  }
  return out;
}

/* ── theme diff ────────────────────────────────────────────────────────────── */

export const TOKEN_LABELS: Record<string, string> = {
  colorBg: "Background",
  colorFg: "Text",
  colorAccent: "Accent",
  colorSurface: "Surface",
  colorMuted: "Muted",
  colorBorder: "Border",
  colorAccentFg: "On-accent",
  fontHeading: "Heading font",
  fontBody: "Body font",
  radius: "Corner radius",
};

export interface ThemeChange {
  key: string;
  label: string;
  before: string;
  after: string;
  base?: string;
  conflict: boolean;
}

export function diffTheme(
  base: ThemeTokens | null,
  parent: ThemeTokens,
  branch: ThemeTokens,
): ThemeChange[] {
  const out: ThemeChange[] = [];
  for (const key of Object.keys(TOKEN_LABELS) as (keyof ThemeTokens)[]) {
    const p = parent[key];
    const b = branch[key];
    if (p === b) continue;
    if (base) {
      const a = base[key];
      if (b === a) continue; // parent advanced; nothing to merge
      out.push({ key, label: TOKEN_LABELS[key], before: p, after: b, base: a, conflict: p !== a });
    } else {
      out.push({ key, label: TOKEN_LABELS[key], before: p, after: b, conflict: false });
    }
  }
  return out;
}

/* ── structural diff ───────────────────────────────────────────────────────── */

/** First text value of a node's subtree, for a human-readable label. */
export function sampleOf(node: PageNode): string {
  const own = Object.values(textFieldsOf(node));
  if (own.length) return own[0];
  for (const child of node.children ?? []) {
    const s = sampleOf(child);
    if (s) return s;
  }
  return "";
}

/** A node the branch added INSIDE a component both sites share (e.g. a Card in a Columns). */
export interface AddedNode {
  nodeId: string;
  type: string;
  sample: string;
  /** Anchors for insertion on the parent: the surrounding node / component. */
  parentNodeId: string;
  branchComponentId: string;
  index: number;
}
/** A node the branch deleted from a shared component. */
export interface RemovedNode {
  nodeId: string;
  type: string;
  sample: string;
}
/** A whole section (new component + page reference) the branch added. */
export interface AddedSection {
  branchComponentId: string;
  pagePath: string;
  index: number;
  /** The mapped parent-side component whose reference this one follows, if any. */
  afterParentComponentId: string | null;
  kind: string;
  sample: string;
}
/** A section reference the branch removed from a page. */
export interface RemovedSection {
  parentComponentId: string;
  pagePath: string;
  kind: string;
  sample: string;
}

export interface PageRefs {
  path: string;
  title: string;
  /** Ordered component ids referenced by the page body's top-level @component nodes. */
  refs: string[];
}

/** The component ids a page body references, in order. */
export function pageRefIds(body: PageBody): string[] {
  const out: string[] = [];
  for (const n of body.root ?? []) {
    if (n.type === SHARED_COMPONENT_TYPE) {
      const cid = componentIdOf(n);
      if (cid) out.push(cid);
    }
  }
  return out;
}

export interface StructuralDiff {
  addedNodes: AddedNode[];
  removedNodes: RemovedNode[];
  sectionsAdded: AddedSection[];
  sectionsRemoved: RemovedSection[];
  pagesAdded: { path: string; title: string }[];
  pagesRemoved: string[];
}

/**
 * Compare structure. `componentMap` is parent→branch from the fork; without it
 * (legacy branch) section- and page-level results are best-effort only.
 * `baseBlocks` guards removals: a node/section the parent created AFTER the fork
 * is unknown to the branch and must never be reported as "removed by it".
 */
export function diffStructure(args: {
  baseBlocks: Blocks | null;
  basePagePaths: string[] | null;
  componentMap: Record<string, string> | null;
  parentPlaces: Map<string, NodePlace>;
  branchPlaces: Map<string, NodePlace>;
  parentPages: PageRefs[];
  branchPages: PageRefs[];
  branchComponentKinds: Record<string, { kind: string; sample: string }>;
  parentComponentKinds: Record<string, { kind: string; sample: string }>;
}): StructuralDiff {
  const {
    baseBlocks,
    basePagePaths,
    componentMap,
    parentPlaces,
    branchPlaces,
    parentPages,
    branchPages,
    branchComponentKinds,
    parentComponentKinds,
  } = args;

  const branchToParent = new Map<string, string>();
  const mappedBranch = new Set<string>();
  if (componentMap) {
    for (const [p, b] of Object.entries(componentMap)) {
      branchToParent.set(b, p);
      mappedBranch.add(b);
    }
  }

  // ── node-level, inside shared components ────────────────────────────────
  const addedNodes: AddedNode[] = [];
  for (const [id, place] of branchPlaces) {
    if (parentPlaces.has(id)) continue;
    // Only top-most additions: an added subtree travels with its root.
    if (place.parentNodeId && !parentPlaces.has(place.parentNodeId)) continue;
    // Inside a component the parent also has (mapped, or legacy: the anchor node
    // exists on the parent side). A node in a NEW component is part of a
    // section-add below, not a node-add.
    const shared =
      (componentMap && mappedBranch.has(place.componentId)) ||
      (!componentMap && place.parentNodeId && parentPlaces.has(place.parentNodeId));
    if (!shared) continue;
    addedNodes.push({
      nodeId: id,
      type: place.node.type,
      sample: sampleOf(place.node),
      parentNodeId: place.parentNodeId,
      branchComponentId: place.componentId,
      index: place.index,
    });
  }

  const removedNodes: RemovedNode[] = [];
  for (const [id, place] of parentPlaces) {
    if (branchPlaces.has(id)) continue;
    // Top-most only: if this node's parent was also removed, skip the child —
    // it disappears with its subtree root.
    if (place.parentNodeId && !branchPlaces.has(place.parentNodeId)) continue;
    // The branch can only have removed what existed at the fork.
    if (baseBlocks && !baseBlocks[id]) continue;
    // Legacy safety: without a baseline we cannot tell "branch removed" from
    // "parent added later", so only report when a baseline exists.
    if (!baseBlocks) continue;
    removedNodes.push({ nodeId: id, type: place.node.type, sample: sampleOf(place.node) });
  }

  // ── section-level (page references) ─────────────────────────────────────
  const sectionsAdded: AddedSection[] = [];
  const sectionsRemoved: RemovedSection[] = [];
  const parentByPath = new Map(parentPages.map((p) => [p.path, p]));

  if (componentMap) {
    for (const bp of branchPages) {
      const pp = parentByPath.get(bp.path);
      if (!pp) continue; // whole page added — below
      const parentRefSet = new Set(pp.refs);

      // Added: a branch ref whose component was born on the branch.
      let lastMappedParentRef: string | null = null;
      bp.refs.forEach((ref, index) => {
        const mapped = branchToParent.get(ref);
        if (mapped) {
          lastMappedParentRef = mapped;
          return;
        }
        const meta = branchComponentKinds[ref] ?? { kind: "Section", sample: "" };
        sectionsAdded.push({
          branchComponentId: ref,
          pagePath: bp.path,
          index,
          afterParentComponentId: lastMappedParentRef,
          kind: meta.kind,
          sample: meta.sample,
        });
      });

      // Removed: a parent ref that existed at fork whose branch twin is gone.
      const branchRefSet = new Set(bp.refs);
      for (const ref of pp.refs) {
        const twin = componentMap[ref];
        if (!twin) continue; // parent added this section after the fork
        if (branchRefSet.has(twin)) continue;
        if (!parentRefSet.has(ref)) continue;
        const meta = parentComponentKinds[ref] ?? { kind: "Section", sample: "" };
        sectionsRemoved.push({
          parentComponentId: ref,
          pagePath: pp.path,
          kind: meta.kind,
          sample: meta.sample,
        });
      }
    }
  }

  // ── page-level ──────────────────────────────────────────────────────────
  const parentPaths = new Set(parentPages.map((p) => p.path));
  const branchPaths = new Set(branchPages.map((p) => p.path));
  const pagesAdded = branchPages
    .filter((p) => !parentPaths.has(p.path))
    .map((p) => ({ path: p.path, title: p.title }));
  const pagesRemoved = parentPages
    .filter((p) => !branchPaths.has(p.path))
    // Same rule as removals everywhere: only what the branch actually saw.
    .filter((p) => (basePagePaths ? basePagePaths.includes(p.path) : false))
    .map((p) => p.path);

  return { addedNodes, removedNodes, sectionsAdded, sectionsRemoved, pagesAdded, pagesRemoved };
}

/* ── tree edits (used by merge; pure) ──────────────────────────────────────── */

/** A new tree with `subtree` inserted under `parentNodeId` ("" = root) at `index`. */
export function insertNode(
  root: PageNode[],
  parentNodeId: string,
  index: number,
  subtree: PageNode,
): PageNode[] {
  if (!parentNodeId) {
    const next = [...root];
    next.splice(Math.min(Math.max(index, 0), next.length), 0, subtree);
    return next;
  }
  return root.map((n) => {
    if (n.id === parentNodeId) {
      const kids = [...(n.children ?? [])];
      kids.splice(Math.min(Math.max(index, 0), kids.length), 0, subtree);
      return { ...n, children: kids };
    }
    return n.children?.length
      ? { ...n, children: insertNode(n.children, parentNodeId, index, subtree) }
      : n;
  });
}

/** A new tree with node `nodeId` (and its subtree) removed. */
export function removeNode(root: PageNode[], nodeId: string): PageNode[] {
  return root
    .filter((n) => n.id !== nodeId)
    .map((n) => (n.children?.length ? { ...n, children: removeNode(n.children, nodeId) } : n));
}
