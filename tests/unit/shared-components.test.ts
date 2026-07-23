/**
 * Shared components, in isolation.
 *
 * Expansion, overrides and cycle detection are pure functions over trees, so
 * they can be pinned down here with no database and no React. Everything the
 * build worker and the editor canvas rely on is one of these three.
 */
import { describe, expect, it } from "vitest";
import { createComponentRef, createNode } from "../../src/lib/registry";
import {
  MAX_COMPONENT_DEPTH,
  describeCycle,
  detectComponentCycles,
  directComponentRefs,
  expandComponents,
  reachableComponentIds,
  stripExpansion,
} from "../../src/lib/shared-components";
import { extractRefs } from "../../src/lib/refs";
import type { PageBody, PageNode, ResolvedSharedComponent } from "../../src/lib/registry/types";

const heading = (id: string, text: string): PageNode => {
  const n = createNode("Heading", id);
  n.props.text = text;
  return n;
};

const body = (root: PageNode[]): PageBody => ({ version: 1, root });

const definitions = (
  entries: Record<string, PageNode[]>,
): Record<string, ResolvedSharedComponent> =>
  Object.fromEntries(
    Object.entries(entries).map(([id, root]) => [id, { id, name: id, root }]),
  );

describe("shared components — expansion", () => {
  it("fills an instance with the definition's tree", () => {
    const ref = createComponentRef("header", "i1");
    const out = expandComponents([ref], definitions({ header: [heading("h1", "Hello")] }));

    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("@component");
    expect(out[0].children).toHaveLength(1);
    expect(out[0].children[0].props.text).toBe("Hello");
  });

  it("keeps the instance node, so it stays selectable and movable", () => {
    const ref = createComponentRef("header", "i1");
    const out = expandComponents([ref], definitions({ header: [heading("h1", "x")] }));
    expect(out[0].id).toBe("i1");
  });

  it("gives two instances of one component distinct node ids", () => {
    const out = expandComponents(
      [createComponentRef("header", "i1"), createComponentRef("header", "i2")],
      definitions({ header: [heading("h1", "x")] }),
    );

    const ids = out.flatMap((n) => n.children.map((c) => c.id));
    expect(ids).toEqual(["i1~h1", "i2~h1"]);
    expect(new Set(ids).size).toBe(2);
  });

  it("records where each expanded node came from", () => {
    const out = expandComponents(
      [createComponentRef("header", "i1")],
      definitions({ header: [heading("h1", "x")] }),
    );
    expect(out[0].children[0].fromComponent).toEqual({
      instanceId: "i1",
      componentId: "header",
      innerId: "h1",
    });
  });

  it("leaves a missing component as an empty reference rather than dropping it", () => {
    const out = expandComponents([createComponentRef("gone", "i1")], definitions({}));
    expect(out[0].type).toBe("@component");
    expect(out[0].children).toHaveLength(0);
  });

  it("expands components nested inside components", () => {
    const out = expandComponents(
      [createComponentRef("outer", "i1")],
      definitions({
        outer: [createComponentRef("inner", "o1")],
        inner: [heading("h1", "deep")],
      }),
    );

    const innerInstance = out[0].children[0];
    expect(innerInstance.id).toBe("i1~o1");
    expect(innerInstance.children[0].props.text).toBe("deep");
  });

  it("stops at the depth cap instead of recursing forever", () => {
    // A cycle that got past publish somehow — belt and braces.
    const out = expandComponents(
      [createComponentRef("a", "i1")],
      definitions({ a: [createComponentRef("a", "x1")] }),
    );

    let depth = 0;
    let cursor: PageNode | undefined = out[0];
    while (cursor?.children?.length) {
      cursor = cursor.children[0];
      depth++;
    }
    expect(depth).toBeLessThanOrEqual(MAX_COMPONENT_DEPTH + 1);
  });
});

describe("shared components — overrides", () => {
  it("applies an override to the matching inner node only", () => {
    const ref = createComponentRef("header", "i1");
    ref.props.overrides = { h1: { text: "Overridden" } };

    const out = expandComponents(
      [ref, createComponentRef("header", "i2")],
      definitions({ header: [heading("h1", "Default")] }),
    );

    expect(out[0].children[0].props.text).toBe("Overridden");
    expect(out[1].children[0].props.text).toBe("Default");
  });

  it("leaves props the override does not mention alone", () => {
    const ref = createComponentRef("header", "i1");
    ref.props.overrides = { h1: { text: "New" } };

    const definition = heading("h1", "Old");
    definition.props.level = "h3";

    const out = expandComponents([ref], definitions({ header: [definition] }));
    expect(out[0].children[0].props.text).toBe("New");
    expect(out[0].children[0].props.level).toBe("h3");
  });

  it("does not mutate the definition", () => {
    const definition = heading("h1", "Original");
    const ref = createComponentRef("header", "i1");
    ref.props.overrides = { h1: { text: "Changed" } };

    expandComponents([ref], definitions({ header: [definition] }));
    expect(definition.props.text).toBe("Original");
  });
});

describe("shared components — what gets stored", () => {
  it("strips expansion provenance, so only storable nodes are ever persisted", () => {
    const expanded = expandComponents(
      [createComponentRef("header", "i1")],
      definitions({ header: [heading("h1", "x")] }),
    );

    const stored = stripExpansion(expanded);
    expect(JSON.stringify(stored)).not.toContain("fromComponent");
  });

  it("stores a reference, not a copy of the content", () => {
    const ref = createComponentRef("header", "i1");
    const serialized = JSON.stringify(ref);

    expect(serialized).toContain("header");
    expect(serialized).not.toMatch(/<[a-z]/i); // still no markup, ever
    expect(ref.children).toHaveLength(0);
  });
});

describe("shared components — dependency extraction", () => {
  it("declares a component reference through the prop schema, like any other ref", () => {
    // Nothing special-cases "@component" in the extractor. The reference is
    // found because the schema says componentId is `ref: "component"`.
    const refs = extractRefs([createComponentRef("header", "i1")]);
    expect(refs).toContainEqual({ refType: "component", refId: "header" });
  });

  it("finds every component reachable from a set of bodies", () => {
    const reachable = reachableComponentIds(
      [body([createComponentRef("outer", "i1")])],
      {
        outer: body([createComponentRef("inner", "o1")]),
        inner: body([heading("h1", "x")]),
        unused: body([]),
      },
    );

    expect(reachable.sort()).toEqual(["inner", "outer"]);
  });

  it("lists only direct references, not nested ones", () => {
    expect(directComponentRefs([createComponentRef("a", "i1")])).toEqual(["a"]);
  });
});

describe("shared components — cycles", () => {
  it("accepts a graph with no loops", () => {
    expect(
      detectComponentCycles({
        a: body([createComponentRef("b", "n1")]),
        b: body([heading("h1", "x")]),
      }),
    ).toBeNull();
  });

  it("catches a component that contains itself", () => {
    const cycle = detectComponentCycles({ a: body([createComponentRef("a", "n1")]) });
    expect(cycle).not.toBeNull();
    expect(cycle!.path).toEqual(["a", "a"]);
  });

  it("catches an indirect loop", () => {
    const cycle = detectComponentCycles({
      a: body([createComponentRef("b", "n1")]),
      b: body([createComponentRef("c", "n2")]),
      c: body([createComponentRef("a", "n3")]),
    });

    expect(cycle).not.toBeNull();
    expect(describeCycle(cycle!, { a: "Header", b: "Nav", c: "Logo" })).toBe(
      "Header → Nav → Logo → Header",
    );
  });

  it("does not mistake a diamond for a cycle", () => {
    // Two components both using a third is reuse, not a loop.
    expect(
      detectComponentCycles({
        a: body([createComponentRef("shared", "n1")]),
        b: body([createComponentRef("shared", "n2")]),
        shared: body([heading("h1", "x")]),
      }),
    ).toBeNull();
  });
});
