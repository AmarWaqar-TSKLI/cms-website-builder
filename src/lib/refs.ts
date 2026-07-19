/**
 * Reference extraction — the bridge between versioned pages and live data.
 *
 * At publish time we walk every pinned body, and for each node ask the registry
 * "which of your props are references, and to what?". The answers become
 * release_dependencies rows. Nothing is guessed: a prop is a reference only
 * because its schema says `ref: "product"`.
 *
 * The reverse index this produces answers the question that makes D5's accepted
 * cost survivable: "which live releases break if I delete this product?"
 */
import { getSchema, walk } from "./registry";
import type { PageBody, PageNode, RefKind } from "./registry/types";

export interface Ref {
  refType: RefKind;
  refId: string;
}

const keyOf = (r: Ref) => `${r.refType}:${r.refId}`;

/** Direct references declared by component prop schemas. */
export function extractRefs(nodes: PageNode[]): Ref[] {
  const seen = new Map<string, Ref>();

  walk(nodes, (node) => {
    const schema = getSchema(node.type);
    if (!schema) return; // unknown component — nothing to declare

    for (const [propName, def] of Object.entries(schema.props)) {
      if (def.kind !== "ref" && def.kind !== "refList") continue;
      if (!def.ref) continue;

      const value = node.props?.[propName];
      const ids =
        def.kind === "refList"
          ? Array.isArray(value)
            ? value
            : []
          : value
            ? [value]
            : [];

      for (const id of ids) {
        if (typeof id !== "string" || id.length === 0) continue;
        const ref: Ref = { refType: def.ref, refId: id };
        seen.set(keyOf(ref), ref);
      }
    }
  });

  return [...seen.values()];
}

export function extractRefsFromBody(body: PageBody | null | undefined): Ref[] {
  if (!body || !Array.isArray(body.root)) return [];
  return extractRefs(body.root);
}

/** Merge reference sets from several page bodies into one deduplicated list. */
export function mergeRefs(sets: Ref[][]): Ref[] {
  const seen = new Map<string, Ref>();
  for (const set of sets) for (const r of set) seen.set(keyOf(r), r);
  return [...seen.values()];
}

/**
 * Collections fan out: a page referencing a collection transitively depends on
 * every product in it, because those products' titles and prices get frozen
 * into the artifact. Deleting one of them degrades a live page, so the
 * dependency has to be recorded even though no prop names it directly.
 */
export function expandCollectionRefs(
  refs: Ref[],
  productIdsByCollection: Record<string, string[]>,
): Ref[] {
  const out = [...refs];
  const seen = new Set(refs.map(keyOf));
  for (const ref of refs) {
    if (ref.refType !== "collection") continue;
    for (const productId of productIdsByCollection[ref.refId] ?? []) {
      const derived: Ref = { refType: "product", refId: productId };
      if (seen.has(keyOf(derived))) continue;
      seen.add(keyOf(derived));
      out.push(derived);
    }
  }
  return out;
}
