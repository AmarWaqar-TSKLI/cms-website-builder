import { describe, expect, it } from "vitest";
import {
  diffStructure,
  diffTexts,
  diffTheme,
  indexBodies,
  insertNode,
  pageRefIds,
  removeNode,
  type Blocks,
} from "../../src/lib/branch-diff";
import { asTokens } from "../../src/lib/theme";
import type { PageNode } from "../../src/lib/registry/types";

/** A Hero node — a real registry type, so schema-driven text extraction works. */
const hero = (id: string, headline: string): PageNode => ({
  id,
  type: "Hero",
  props: { headline },
  children: [],
});

const blocksOf = (...nodes: [string, string][]): Blocks =>
  Object.fromEntries(
    nodes.map(([id, headline]) => [id, { type: "Hero", text: { headline } }]),
  );

describe("diffTexts (three-way)", () => {
  it("branch-only edit is a clean change", () => {
    const base = blocksOf(["n1", "old"]);
    const parent = blocksOf(["n1", "old"]);
    const branch = blocksOf(["n1", "new"]);
    const [change] = diffTexts(base, parent, branch);
    expect(change.fields[0]).toMatchObject({ before: "old", after: "new", conflict: false });
  });

  it("parent-only edit since the fork is NOT offered as a merge (no silent revert)", () => {
    const base = blocksOf(["n1", "old"]);
    const parent = blocksOf(["n1", "parent edited this"]);
    const branch = blocksOf(["n1", "old"]); // branch never touched it
    expect(diffTexts(base, parent, branch)).toHaveLength(0);
  });

  it("both sides changed the same field → conflict", () => {
    const base = blocksOf(["n1", "old"]);
    const parent = blocksOf(["n1", "parent version"]);
    const branch = blocksOf(["n1", "branch version"]);
    const [change] = diffTexts(base, parent, branch);
    expect(change.conflict).toBe(true);
    expect(change.fields[0]).toMatchObject({
      base: "old",
      before: "parent version",
      after: "branch version",
      conflict: true,
    });
  });

  it("both sides converged on the same value → no diff at all", () => {
    const base = blocksOf(["n1", "old"]);
    const parent = blocksOf(["n1", "same"]);
    const branch = blocksOf(["n1", "same"]);
    expect(diffTexts(base, parent, branch)).toHaveLength(0);
  });

  it("without a baseline, degrades to two-way with no conflict claims", () => {
    const parent = blocksOf(["n1", "a"]);
    const branch = blocksOf(["n1", "b"]);
    const [change] = diffTexts(null, parent, branch);
    expect(change.fields[0]).toMatchObject({ before: "a", after: "b", conflict: false });
    expect(change.fields[0].base).toBeUndefined();
  });
});

describe("diffTheme (three-way)", () => {
  const base = asTokens(undefined);

  it("flags a token both sides moved", () => {
    const parent = { ...base, colorAccent: "#111111" };
    const branch = { ...base, colorAccent: "#222222" };
    const [change] = diffTheme(base, parent, branch);
    expect(change).toMatchObject({ key: "colorAccent", conflict: true });
  });

  it("skips a token only the parent moved", () => {
    const parent = { ...base, colorAccent: "#111111" };
    expect(diffTheme(base, parent, { ...base })).toHaveLength(0);
  });
});

describe("indexBodies + structural diff", () => {
  it("finds a node added inside a shared component, with its anchor", () => {
    const parentIdx = indexBodies([{ componentId: "P1", root: [hero("n1", "x")] }]);
    const branchIdx = indexBodies([
      { componentId: "B1", root: [hero("n1", "x"), hero("n2", "added block")] },
    ]);
    const result = diffStructure({
      baseBlocks: parentIdx.blocks,
      basePagePaths: ["/"],
      componentMap: { P1: "B1" },
      parentPlaces: parentIdx.places,
      branchPlaces: branchIdx.places,
      parentPages: [{ path: "/", title: "Home", refs: ["P1"] }],
      branchPages: [{ path: "/", title: "Home", refs: ["B1"] }],
      branchComponentKinds: {},
      parentComponentKinds: {},
    });
    expect(result.addedNodes).toHaveLength(1);
    expect(result.addedNodes[0]).toMatchObject({
      nodeId: "n2",
      sample: "added block",
      parentNodeId: "",
      branchComponentId: "B1",
      index: 1,
    });
  });

  it("finds a removed node, but never one the parent added after the fork", () => {
    const baseIdx = indexBodies([{ componentId: "P1", root: [hero("n1", "x"), hero("n2", "y")] }]);
    // Parent since added n3; branch removed n2.
    const parentIdx = indexBodies([
      { componentId: "P1", root: [hero("n1", "x"), hero("n2", "y"), hero("n3", "post-fork")] },
    ]);
    const branchIdx = indexBodies([{ componentId: "B1", root: [hero("n1", "x")] }]);
    const result = diffStructure({
      baseBlocks: baseIdx.blocks,
      basePagePaths: ["/"],
      componentMap: { P1: "B1" },
      parentPlaces: parentIdx.places,
      branchPlaces: branchIdx.places,
      parentPages: [{ path: "/", title: "Home", refs: ["P1"] }],
      branchPages: [{ path: "/", title: "Home", refs: ["B1"] }],
      branchComponentKinds: {},
      parentComponentKinds: {},
    });
    const removedIds = result.removedNodes.map((r) => r.nodeId);
    expect(removedIds).toContain("n2");
    expect(removedIds).not.toContain("n3");
  });

  it("a new section on the branch is an added section anchored after its neighbour", () => {
    const parentIdx = indexBodies([{ componentId: "P1", root: [hero("n1", "x")] }]);
    const branchIdx = indexBodies([
      { componentId: "B1", root: [hero("n1", "x")] },
      { componentId: "BNEW", root: [hero("n9", "fresh section")] },
    ]);
    const result = diffStructure({
      baseBlocks: parentIdx.blocks,
      basePagePaths: ["/"],
      componentMap: { P1: "B1" },
      parentPlaces: parentIdx.places,
      branchPlaces: branchIdx.places,
      parentPages: [{ path: "/", title: "Home", refs: ["P1"] }],
      branchPages: [{ path: "/", title: "Home", refs: ["B1", "BNEW"] }],
      branchComponentKinds: { BNEW: { kind: "Hero", sample: "fresh section" } },
      parentComponentKinds: {},
    });
    expect(result.sectionsAdded).toHaveLength(1);
    expect(result.sectionsAdded[0]).toMatchObject({
      branchComponentId: "BNEW",
      pagePath: "/",
      afterParentComponentId: "P1",
    });
    // Its nodes must NOT double-report as node-level adds.
    expect(result.addedNodes).toHaveLength(0);
  });

  it("a section the parent added post-fork is never 'removed by the branch'", () => {
    const parentIdx = indexBodies([
      { componentId: "P1", root: [hero("n1", "x")] },
      { componentId: "PNEW", root: [hero("n8", "parent's new section")] },
    ]);
    const branchIdx = indexBodies([{ componentId: "B1", root: [hero("n1", "x")] }]);
    const result = diffStructure({
      baseBlocks: indexBodies([{ componentId: "P1", root: [hero("n1", "x")] }]).blocks,
      basePagePaths: ["/"],
      componentMap: { P1: "B1" }, // PNEW is unmapped: born after the fork
      parentPlaces: parentIdx.places,
      branchPlaces: branchIdx.places,
      parentPages: [{ path: "/", title: "Home", refs: ["P1", "PNEW"] }],
      branchPages: [{ path: "/", title: "Home", refs: ["B1"] }],
      branchComponentKinds: {},
      parentComponentKinds: {},
    });
    expect(result.sectionsRemoved).toHaveLength(0);
  });

  it("pages added and removed respect the fork-point page set", () => {
    const result = diffStructure({
      baseBlocks: {},
      basePagePaths: ["/", "/about"],
      componentMap: {},
      parentPlaces: new Map(),
      branchPlaces: new Map(),
      // Parent added /pricing post-fork; branch added /faq and dropped /about.
      parentPages: [
        { path: "/", title: "Home", refs: [] },
        { path: "/about", title: "About", refs: [] },
        { path: "/pricing", title: "Pricing", refs: [] },
      ],
      branchPages: [
        { path: "/", title: "Home", refs: [] },
        { path: "/faq", title: "FAQ", refs: [] },
      ],
      branchComponentKinds: {},
      parentComponentKinds: {},
    });
    expect(result.pagesAdded).toEqual([{ path: "/faq", title: "FAQ" }]);
    expect(result.pagesRemoved).toEqual(["/about"]); // NOT /pricing
  });
});

describe("tree edits", () => {
  it("insertNode places a subtree at root and under a parent", () => {
    const root = [hero("n1", "a"), hero("n2", "b")];
    const atRoot = insertNode(root, "", 1, hero("nx", "mid"));
    expect(atRoot.map((n) => n.id)).toEqual(["n1", "nx", "n2"]);

    const columns: PageNode = { id: "c1", type: "Columns", props: {}, children: [hero("k1", "x")] };
    const nested = insertNode([columns], "c1", 1, hero("k2", "y"));
    expect(nested[0].children?.map((n) => n.id)).toEqual(["k1", "k2"]);
  });

  it("removeNode drops a node wherever it sits", () => {
    const columns: PageNode = {
      id: "c1",
      type: "Columns",
      props: {},
      children: [hero("k1", "x"), hero("k2", "y")],
    };
    const next = removeNode([hero("n1", "a"), columns], "k1");
    expect(next[1].children?.map((n) => n.id)).toEqual(["k2"]);
    expect(removeNode(next, "n1").map((n) => n.id)).toEqual(["c1"]);
  });

  it("pageRefIds reads ordered top-level component references", () => {
    const body = {
      version: 1 as const,
      root: [
        { id: "r1", type: "@component", props: { componentId: "C1" }, children: [] },
        hero("n1", "inline"),
        { id: "r2", type: "@component", props: { componentId: "C2" }, children: [] },
      ],
    };
    expect(pageRefIds(body)).toEqual(["C1", "C2"]);
  });
});
