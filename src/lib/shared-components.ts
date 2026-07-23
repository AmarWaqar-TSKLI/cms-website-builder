/**
 * SHARED COMPONENTS — expansion, override merging, and cycle detection.
 *
 * A page body can contain a node of type "@component" whose `componentId` prop
 * names a shared definition. Rendering a page means replacing each such node
 * with a copy of that definition's tree. This module does that replacement, and
 * nothing else — no React, no database, no filesystem — so the build worker, the
 * editor canvas and the tests all expand identically. If they didn't, "what you
 * see while editing is what gets frozen" would stop being true.
 *
 * Three things make this safe rather than merely convenient:
 *
 *   1. IDS ARE REWRITTEN. Two instances of one symbol on the same page would
 *      otherwise emit duplicate node ids. Each expanded node gets
 *      `${instanceId}~${innerId}`, which is also how the editor knows a node is
 *      owned by a symbol and must be edited in the symbol, not in place.
 *
 *   2. EXPANSION IS NOT STORED. The extra `fromComponent` field below is set
 *      here and never written back to page_drafts or page_revisions. The stored
 *      format is still exactly {id, type, props, children}. There is a test that
 *      asserts a round-trip through the database never contains it.
 *
 *   3. CYCLES ARE REFUSED AT PUBLISH. A header containing a footer containing
 *      that header is an infinite tree. `detectComponentCycles` runs inside the
 *      publish transaction and aborts it, so a cycle can never reach a release.
 *      The depth cap here is the second line of defence, for bodies written
 *      before that check existed.
 */
import { walk } from "./registry";
import type { PageBody, PageNode, ResolvedSharedComponent } from "./registry/types";

/**
 * The reserved node type. The `@` prefix cannot collide with a registry
 * component name, which are all bare identifiers like "Hero".
 */
export const SHARED_COMPONENT_TYPE = "@component";

/** Belt-and-braces. Publish rejects cycles outright; this stops runaway trees. */
export const MAX_COMPONENT_DEPTH = 8;

/** Separator between an instance id and a node id inside the symbol. */
export const INSTANCE_SEPARATOR = "~";

export type OverrideMap = Record<string, Record<string, unknown>>;

export function isComponentRef(node: PageNode): boolean {
  return node.type === SHARED_COMPONENT_TYPE;
}

export function componentIdOf(node: PageNode): string | null {
  const id = node.props?.componentId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function overridesOf(node: PageNode): OverrideMap {
  const raw = node.props?.overrides;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as OverrideMap;
}

/** The instance a node belongs to, or null for a node the page owns directly. */
export function instanceIdOf(nodeId: string): string | null {
  const at = nodeId.indexOf(INSTANCE_SEPARATOR);
  return at === -1 ? null : nodeId.slice(0, at);
}

/** True when this node came from a symbol and so cannot be edited in place. */
export function isOwnedByComponent(node: PageNode): boolean {
  return node.fromComponent !== undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference collection
// ─────────────────────────────────────────────────────────────────────────────

/** Component ids named directly by these nodes. Does not follow nesting. */
export function directComponentRefs(nodes: PageNode[]): string[] {
  const found = new Set<string>();
  walk(nodes, (node) => {
    if (!isComponentRef(node)) return;
    const id = componentIdOf(node);
    if (id) found.add(id);
  });
  return [...found];
}

/**
 * Every component reachable from these bodies, following symbol-inside-symbol
 * nesting. The build needs this: a page that uses a header which itself uses a
 * logo must resolve both, and a product referenced only from inside a symbol
 * still has to be frozen into the artifact.
 */
export function reachableComponentIds(
  roots: PageBody[],
  bodyByComponentId: Record<string, PageBody>,
): string[] {
  const seen = new Set<string>();
  const queue = roots.flatMap((b) => directComponentRefs(b?.root ?? []));

  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const body = bodyByComponentId[id];
    if (body) queue.push(...directComponentRefs(body.root ?? []));
  }
  return [...seen];
}

// ─────────────────────────────────────────────────────────────────────────────
// Cycle detection
// ─────────────────────────────────────────────────────────────────────────────

export interface ComponentCycle {
  /** Component ids in cycle order, first id repeated at the end. */
  path: string[];
}

/**
 * Classic three-colour DFS over the symbol graph.
 *
 * Returns the first cycle found, or null. Publish calls this before writing
 * anything, so a cycle fails the whole transaction rather than producing a
 * release that cannot be built.
 */
export function detectComponentCycles(
  bodyByComponentId: Record<string, PageBody>,
): ComponentCycle | null {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour: Record<string, number> = {};
  const stack: string[] = [];

  const visit = (id: string): ComponentCycle | null => {
    if (colour[id] === BLACK) return null;
    if (colour[id] === GREY) {
      // Found a back edge — the cycle is everything from this id onward.
      const from = stack.indexOf(id);
      return { path: [...stack.slice(from), id] };
    }

    colour[id] = GREY;
    stack.push(id);

    const body = bodyByComponentId[id];
    for (const next of directComponentRefs(body?.root ?? [])) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }

    stack.pop();
    colour[id] = BLACK;
    return null;
  };

  for (const id of Object.keys(bodyByComponentId)) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

/** Human-readable cycle message, using names where we have them. */
export function describeCycle(
  cycle: ComponentCycle,
  nameById: Record<string, string> = {},
): string {
  return cycle.path.map((id) => nameById[id] ?? id.slice(0, 8)).join(" → ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Expansion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fill every "@component" node with a copy of its definition's tree.
 *
 * The reference node is KEPT rather than replaced by its contents. That costs
 * one wrapper element and buys two things worth more than it: the instance stays
 * addressable — the editor can select it, move it, override it, detach it —
 * and the rendered markup says out loud which region of the page came from which
 * symbol.
 *
 * A missing component (never pinned, or the prop was never set) is left with no
 * children, and the registry entry renders a visible placeholder. Degrading
 * loudly beats a page quietly losing its header.
 */
export function expandComponents(
  nodes: PageNode[],
  components: Record<string, ResolvedSharedComponent>,
  depth = 0,
): PageNode[] {
  return nodes.map((node) => {
    if (!isComponentRef(node)) {
      return {
        ...node,
        children: node.children?.length
          ? expandComponents(node.children, components, depth)
          : [],
      };
    }

    const componentId = componentIdOf(node);
    const definition = componentId ? components[componentId] : undefined;

    if (!componentId || !definition || definition.missing || depth >= MAX_COMPONENT_DEPTH) {
      return { ...node, children: [] }; // placeholder
    }

    const overrides = overridesOf(node);
    const inner = expandComponents(definition.root ?? [], components, depth + 1);

    return {
      ...node,
      children: inner.map((child) => rebase(child, node.id, componentId, overrides)),
    };
  });
}

/**
 * Re-key one node of a symbol's tree for one instance, applying that instance's
 * overrides.
 *
 * Overrides are keyed by the node's id INSIDE the symbol, which is stable while
 * the symbol is edited — reordering or restyling the symbol keeps every
 * instance's overrides attached to the right node. Deleting that node inside the
 * symbol drops its overrides, which is the correct outcome and the only one that
 * doesn't accumulate garbage.
 */
function rebase(
  node: PageNode,
  instanceId: string,
  componentId: string,
  overrides: OverrideMap,
): PageNode {
  // The node's path RELATIVE TO THIS INSTANCE, and the key its overrides use.
  //
  // Expansion runs innermost-first, so by the time this level sees a node from a
  // nested component its id is already the inner path — "b1~t1" for a text node
  // inside a Button instance inside this component. Prefixing then yields
  // "i1~b1~t1", and this key is exactly the part after the outermost instance.
  //
  // Because the OUTERMOST call runs last, the fields below settle on the values
  // the page can actually act on: `instanceId` ends as the instance that really
  // exists in the page's stored tree, and `overrideKey` as the full path to this
  // node inside it. Addressing an override at the inner instance instead would
  // name a node that only exists inside a component's tree — the page could not
  // find it, and the override would silently do nothing.
  const overrideKey = node.id;
  const patch = overrides[overrideKey];

  return {
    ...node,
    id: `${instanceId}${INSTANCE_SEPARATOR}${node.id}`,
    // Outer overrides are applied after inner ones, so a page-level override
    // beats a default set inside the component. That is the precedence you want.
    props: patch ? { ...node.props, ...patch } : node.props,
    children: (node.children ?? []).map((c) => rebase(c, instanceId, componentId, overrides)),
    fromComponent: {
      // Innermost owner — answers "which component do I open to edit this?".
      componentId: node.fromComponent?.componentId ?? componentId,
      innerId: node.fromComponent?.innerId ?? node.id,
      // Outermost instance + path — answers "where do I record an override?".
      instanceId,
      overrideKey,
    },
  };
}

/**
 * Strip anything expansion added, so a tree that has been through the canvas can
 * be stored. Autosave runs the stored tree, not the expanded one, but this makes
 * the invariant enforceable instead of merely intended.
 */
export function stripExpansion(nodes: PageNode[]): PageNode[] {
  return nodes.map(({ fromComponent: _ignored, ...node }) => ({
    ...node,
    children: stripExpansion(node.children ?? []),
  }));
}

/** Nodes an instance exposes for overriding, in document order. */
export function overridableNodes(
  componentId: string,
  components: Record<string, ResolvedSharedComponent>,
): PageNode[] {
  const definition = components[componentId];
  if (!definition || definition.missing) return [];
  const flat: PageNode[] = [];
  walk(definition.root ?? [], (n) => flat.push(n));
  return flat;
}
