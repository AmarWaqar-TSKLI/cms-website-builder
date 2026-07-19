import { describe, expect, it } from "vitest";
import {
  expandCollectionRefs,
  extractRefs,
  extractRefsFromBody,
  mergeRefs,
} from "../../src/lib/refs";
import { createNode } from "../../src/lib/registry";
import type { PageNode } from "../../src/lib/registry/types";

function hero(background: string): PageNode {
  const n = createNode("Hero", "h1");
  n.props.background = background;
  return n;
}
function grid(collection: string, id = "g1"): PageNode {
  const n = createNode("ProductGrid", id);
  n.props.collection = collection;
  return n;
}
function text(): PageNode {
  return createNode("TextBlock", "t1");
}

describe("reference extraction", () => {
  it("reads references from prop schemas, not from guessing", () => {
    const refs = extractRefs([hero("media_1"), grid("col_1")]);
    expect(refs).toEqual(
      expect.arrayContaining([
        { refType: "media", refId: "media_1" },
        { refType: "collection", refId: "col_1" },
      ]),
    );
    expect(refs).toHaveLength(2);
  });

  it("ignores props that merely look like ids", () => {
    // TextBlock's body is prose, and its schema does not declare it a reference.
    // A regex-based extractor would produce a false dependency here.
    const t = text();
    t.props.body = "col_1 media_1 550e8400-e29b-41d4-a716-446655440000";
    expect(extractRefs([t])).toEqual([]);
  });

  it("skips empty reference props", () => {
    expect(extractRefs([hero(""), grid("")])).toEqual([]);
  });

  it("deduplicates the same reference used twice", () => {
    const refs = extractRefs([grid("col_1", "g1"), grid("col_1", "g2")]);
    expect(refs).toEqual([{ refType: "collection", refId: "col_1" }]);
  });

  it("walks nested children", () => {
    const parent = createNode("Hero", "p1");
    parent.props.background = "media_parent";
    parent.children = [grid("col_child")];
    const refs = extractRefs([parent]);
    expect(refs).toEqual(
      expect.arrayContaining([
        { refType: "media", refId: "media_parent" },
        { refType: "collection", refId: "col_child" },
      ]),
    );
  });

  it("ignores components that are not in the registry", () => {
    const unknown: PageNode = {
      id: "u1",
      type: "SomethingRemoved",
      props: { collection: "col_1" },
      children: [],
    };
    expect(extractRefs([unknown])).toEqual([]);
  });

  it("handles a whole body, and a malformed one", () => {
    expect(extractRefsFromBody({ version: 1, root: [hero("m1")] })).toEqual([
      { refType: "media", refId: "m1" },
    ]);
    expect(extractRefsFromBody(null)).toEqual([]);
    expect(extractRefsFromBody({ version: 1 } as never)).toEqual([]);
  });

  it("merges reference sets across pages without duplicating", () => {
    const merged = mergeRefs([
      [{ refType: "media", refId: "m1" }],
      [
        { refType: "media", refId: "m1" },
        { refType: "collection", refId: "c1" },
      ],
    ]);
    expect(merged).toHaveLength(2);
  });

  it("fans a collection out to its products", () => {
    // A page names only the collection, but the artifact freezes each product's
    // title and price — so each product is a real dependency.
    const expanded = expandCollectionRefs([{ refType: "collection", refId: "c1" }], {
      c1: ["p1", "p2"],
    });
    expect(expanded).toEqual(
      expect.arrayContaining([
        { refType: "collection", refId: "c1" },
        { refType: "product", refId: "p1" },
        { refType: "product", refId: "p2" },
      ]),
    );
    expect(expanded).toHaveLength(3);
  });

  it("does not duplicate a product that was also referenced directly", () => {
    const expanded = expandCollectionRefs(
      [
        { refType: "collection", refId: "c1" },
        { refType: "product", refId: "p1" },
      ],
      { c1: ["p1", "p2"] },
    );
    expect(expanded.filter((r) => r.refType === "product" && r.refId === "p1")).toHaveLength(1);
  });
});
