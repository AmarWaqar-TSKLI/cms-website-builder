/**
 * THE REGISTRY — the mapping that makes "store a description, not HTML" work.
 *
 *   database: {"type": "Hero", "props": {...}}
 *   registry: "Hero" -> the actual component + its prop schema
 *
 * Both the editor canvas and the build worker resolve names through this exact
 * table, which is why what you see while editing is what gets frozen on disk.
 */
import { COMPONENTS } from "./components";
import type { ComponentSchema, ModuleName, PageNode, RegistryEntry } from "./types";

export * from "./types";

const REGISTRY: Record<string, RegistryEntry> = Object.fromEntries(
  COMPONENTS.map((c) => [c.schema.name, c]),
);

export function getComponent(type: string): RegistryEntry | undefined {
  return REGISTRY[type];
}

export function getSchema(type: string): ComponentSchema | undefined {
  return REGISTRY[type]?.schema;
}

export function allSchemas(): ComponentSchema[] {
  return COMPONENTS.map((c) => c.schema);
}

/**
 * Palette filtering (D6). A component that requires a module the site has not
 * enabled simply does not exist for that site.
 */
export function paletteFor(enabledModules: ModuleName[]): ComponentSchema[] {
  return allSchemas().filter(
    (s) => !s.requiresModule || enabledModules.includes(s.requiresModule),
  );
}

/** Build a node with every prop defaulted from its schema. */
export function createNode(type: string, id: string): PageNode {
  const schema = getSchema(type);
  if (!schema) throw new Error(`Unknown component type: ${type}`);
  const props: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(schema.props)) props[key] = def.default;
  return { id, type, props, children: [] };
}

/** Depth-first walk over a stored description. Used by extraction and rendering. */
export function walk(nodes: PageNode[], visit: (node: PageNode, depth: number) => void, depth = 0) {
  for (const node of nodes) {
    visit(node, depth);
    if (node.children?.length) walk(node.children, visit, depth + 1);
  }
}

/** Find a node by id anywhere in the tree. */
export function findNode(nodes: PageNode[], id: string): PageNode | undefined {
  let found: PageNode | undefined;
  walk(nodes, (n) => {
    if (n.id === id) found = n;
  });
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree operations.
//
// The body is a tree, not a list — Columns can contain other blocks — so
// add/move/remove all work on (parentId, index) rather than a flat position.
// Every function returns a NEW tree; the store never mutates in place, which is
// what makes undo a matter of keeping the previous root around.
// ─────────────────────────────────────────────────────────────────────────────

export interface NodeLocation {
  parentId: string | null;
  index: number;
}

/** Where does this node sit? null parentId means top level. */
export function locate(nodes: PageNode[], id: string): NodeLocation | null {
  const search = (list: PageNode[], parentId: string | null): NodeLocation | null => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { parentId, index: i };
      const inChild = search(list[i].children ?? [], list[i].id);
      if (inChild) return inChild;
    }
    return null;
  };
  return search(nodes, null);
}

/** Remove a node, returning the new tree and the node that was removed. */
export function removeFromTree(
  nodes: PageNode[],
  id: string,
): { tree: PageNode[]; removed: PageNode | null } {
  let removed: PageNode | null = null;
  const prune = (list: PageNode[]): PageNode[] =>
    list
      .filter((n) => {
        if (n.id === id) {
          removed = n;
          return false;
        }
        return true;
      })
      .map((n) => ({ ...n, children: prune(n.children ?? []) }));
  return { tree: prune(nodes), removed };
}

/** Insert a node at a position. parentId null = top level. */
export function insertIntoTree(
  nodes: PageNode[],
  node: PageNode,
  parentId: string | null,
  index: number,
): PageNode[] {
  if (parentId === null) {
    const next = [...nodes];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, node);
    return next;
  }
  return nodes.map((n) => {
    if (n.id === parentId) {
      const children = [...(n.children ?? [])];
      children.splice(Math.max(0, Math.min(index, children.length)), 0, node);
      return { ...n, children };
    }
    return { ...n, children: insertIntoTree(n.children ?? [], node, parentId, index) };
  });
}

/** True when `ancestorId` is at or above `id` — used to refuse dropping a node into itself. */
export function isAncestor(nodes: PageNode[], ancestorId: string, id: string): boolean {
  const node = findNode(nodes, ancestorId);
  if (!node) return false;
  if (ancestorId === id) return true;
  let hit = false;
  walk(node.children ?? [], (n) => {
    if (n.id === id) hit = true;
  });
  return hit;
}

/** Deep copy with fresh ids throughout. */
export function cloneWithNewIds(node: PageNode, nextId: () => string): PageNode {
  return {
    ...node,
    id: nextId(),
    props: structuredClone(node.props),
    children: (node.children ?? []).map((c) => cloneWithNewIds(c, nextId)),
  };
}
