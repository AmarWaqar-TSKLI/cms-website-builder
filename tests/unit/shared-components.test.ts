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
  decompose,
  describeCycle,
  detectComponentCycles,
  directComponentRefs,
  expandComponents,
  reachableComponentIds,
  stripExpansion,
} from "../../src/lib/shared-components";
import { extractRefs } from "../../src/lib/refs";
import type { PageBody, PageNode, ResolvedComponent } from "../../src/lib/registry/types";

const heading = (id: string, text: string): PageNode => {
  const n = createNode("Heading", id);
  n.props.text = text;
  return n;
};

const body = (root: PageNode[]): PageBody => ({ version: 1, root });

const definitions = (
  entries: Record<string, PageNode[]>,
): Record<string, ResolvedComponent> =>
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
      // Which component owns it → what "Edit component" opens.
      componentId: "header",
      innerId: "h1",
      // Where an override goes → an instance the page's stored tree really has.
      // With one level these coincide; the nesting tests below show them diverge.
      instanceId: "i1",
      overrideKey: "h1",
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

describe("shared components — deep nesting", () => {
  // The case that matters in practice: a page uses a Card component, the Card
  // uses a Button component, the Button contains text. Three levels, and the
  // page only ever stored one node.
  const nested = () =>
    definitions({
      card: [
        (() => {
          const col = createNode("Columns", "c1");
          col.children = [heading("t1", "Card title"), createComponentRef("button", "b1")];
          return col;
        })(),
      ],
      button: [heading("btn", "Click me")],
    });

  it("expands every level and keeps ids unique down the whole path", () => {
    const out = expandComponents([createComponentRef("card", "i1")], nested());

    const columns = out[0].children[0];
    expect(columns.id).toBe("i1~c1");

    const title = columns.children[0];
    const buttonInstance = columns.children[1];
    const buttonText = buttonInstance.children[0];

    expect(title.id).toBe("i1~t1");
    expect(buttonInstance.id).toBe("i1~b1");
    // Three levels deep, prefixed once per level. No collision is possible
    // because each level contributes its own instance id.
    expect(buttonText.id).toBe("i1~b1~btn");
    expect(buttonText.props.text).toBe("Click me");
  });

  it("points provenance at the innermost owner, so 'edit' opens the right component", () => {
    const out = expandComponents([createComponentRef("card", "i1")], nested());
    const buttonText = out[0].children[0].children[1].children[0];

    // The text belongs to Button, not to Card — clicking edit must open Button.
    expect(buttonText.fromComponent?.componentId).toBe("button");
    expect(buttonText.fromComponent?.innerId).toBe("btn");
  });

  it("addresses overrides at the OUTERMOST instance, the one the page really has", () => {
    const out = expandComponents([createComponentRef("card", "i1")], nested());
    const buttonText = out[0].children[0].children[1].children[0];

    // "i1" is a node in the page's stored tree. "b1" is not — it only exists
    // inside Card's tree. Addressing the override at b1 would silently do
    // nothing, because the page could never find it.
    expect(buttonText.fromComponent?.instanceId).toBe("i1");
    expect(buttonText.fromComponent?.overrideKey).toBe("b1~btn");
  });

  it("applies a page-level override to text three components deep", () => {
    const ref = createComponentRef("card", "i1");
    ref.props.overrides = { "b1~btn": { text: "Buy now" } };

    const out = expandComponents([ref], nested());
    const buttonText = out[0].children[0].children[1].children[0];
    expect(buttonText.props.text).toBe("Buy now");
  });

  it("keeps two instances of the same deep component independent", () => {
    const a = createComponentRef("card", "i1");
    a.props.overrides = { "b1~btn": { text: "Buy now" } };
    const b = createComponentRef("card", "i2");

    const out = expandComponents([a, b], nested());
    const textA = out[0].children[0].children[1].children[0];
    const textB = out[1].children[0].children[1].children[0];

    expect(textA.props.text).toBe("Buy now");
    expect(textB.props.text).toBe("Click me");
    expect(textA.id).not.toBe(textB.id);
  });

  it("lets one page place the same component at different positions", () => {
    // Position is owned by the PAGE, never by the component. The same definition
    // appears first on one page and third on another simply because the trees
    // that reference it put the node in a different place.
    const pageA = [createComponentRef("button", "x1"), heading("a1", "after")];
    const pageB = [heading("b1", "before"), heading("b2", "also"), createComponentRef("button", "x2")];

    const outA = expandComponents(pageA, nested());
    const outB = expandComponents(pageB, nested());

    expect(outA[0].type).toBe("@component");
    expect(outA[0].children[0].props.text).toBe("Click me");
    expect(outB[2].type).toBe("@component");
    expect(outB[2].children[0].props.text).toBe("Click me");
  });
});

describe("components as the unit of storage", () => {
  // The editor works on one expanded tree; storage is a page of references plus
  // a body per component. These must be exact inverses, or the editor is editing
  // something other than what gets stored.
  const defs = () =>
    definitions({
      hero: [heading("h1", "Welcome")],
      cta: [heading("c1", "Buy")],
    });

  const pageOfRefs = () => [createComponentRef("hero", "r1"), createComponentRef("cta", "r2")];

  it("round-trips: expand then decompose returns the original page", () => {
    const original = pageOfRefs();
    const { root } = decompose(expandComponents(original, defs()));

    expect(root).toHaveLength(2);
    expect(root.map((n) => n.props.componentId)).toEqual(["hero", "cta"]);
    // The page stores references and no content whatsoever.
    expect(root.every((n) => n.children.length === 0)).toBe(true);
    expect(JSON.stringify(root)).not.toContain("Welcome");
  });

  it("hands each component back its own tree, with its own ids", () => {
    const { bodies } = decompose(expandComponents(pageOfRefs(), defs()));

    expect(Object.keys(bodies).sort()).toEqual(["cta", "hero"]);
    // Not "r1~h1" — the instance prefix belongs to rendering, never to storage.
    expect(bodies.hero[0].id).toBe("h1");
    expect(bodies.hero[0].props.text).toBe("Welcome");
  });

  it("carries an edit made on the canvas back into the component's body", () => {
    const expanded = expandComponents(pageOfRefs(), defs());
    // Exactly what typing on the canvas does: mutate the expanded tree.
    expanded[0].children[0].props.text = "Edited on the page";

    const { bodies } = decompose(expanded);
    expect(bodies.hero[0].props.text).toBe("Edited on the page");
  });

  it("refuses to write back a SHARED component, so other pages are untouched", () => {
    const expanded = expandComponents(pageOfRefs(), defs());
    expanded[0].children[0].props.text = "Only this page wanted this";

    // "hero" is used by more than one page, so its body must not be rewritten —
    // that edit belongs in an override on the reference instead.
    const { bodies, root } = decompose(expanded, new Set(["hero"]));

    expect(bodies).not.toHaveProperty("hero");
    expect(bodies).toHaveProperty("cta");
    expect(root[0].props.componentId).toBe("hero");
  });

  it("extracts a component nested inside another into its own body", () => {
    const nested = definitions({
      card: [createComponentRef("button", "b1")],
      button: [heading("t1", "Go")],
    });

    const { root, bodies } = decompose(
      expandComponents([createComponentRef("card", "i1")], nested),
    );

    expect(root).toHaveLength(1);
    // Card stores a reference to Button — not Button's contents.
    expect(bodies.card[0].type).toBe("@component");
    expect(bodies.card[0].props.componentId).toBe("button");
    expect(bodies.card[0].children).toHaveLength(0);
    // Button stores its own text, once.
    expect(bodies.button[0].props.text).toBe("Go");
  });

  it("never lets render-time provenance reach storage", () => {
    const { root, bodies } = decompose(expandComponents(pageOfRefs(), defs()));
    const stored = JSON.stringify({ root, bodies });
    expect(stored).not.toContain("fromComponent");
  });
});
