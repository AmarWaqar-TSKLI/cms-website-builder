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
