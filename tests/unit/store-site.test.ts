import { describe, expect, it } from "vitest";
import { resolveStoreSiteId } from "../../src/lib/store-site";

/** A parent lookup backed by a plain map, standing in for the sites table. */
const lookup =
  (parents: Record<string, string | null>) =>
  async (id: string): Promise<string | null> =>
    parents[id] ?? null;

describe("resolveStoreSiteId", () => {
  it("a site with no parent is its own store", async () => {
    expect(await resolveStoreSiteId("a", lookup({ a: null }))).toBe("a");
  });

  it("a branch resolves to its parent", async () => {
    expect(await resolveStoreSiteId("branch", lookup({ branch: "root", root: null }))).toBe("root");
  });

  it("a branch of a branch resolves to the root", async () => {
    const parents = { c: "b", b: "a", a: null };
    expect(await resolveStoreSiteId("c", lookup(parents))).toBe("a");
  });

  it("an unknown id is its own store rather than an error", async () => {
    expect(await resolveStoreSiteId("ghost", lookup({}))).toBe("ghost");
  });

  it("a cycle in the data terminates instead of hanging", async () => {
    // Should never exist, but a data bug must not become an infinite loop on
    // every product read.
    const parents = { a: "b", b: "a" };
    expect(await resolveStoreSiteId("a", lookup(parents))).toBe("b");
  });

  it("absurd depth is cut off by the bound", async () => {
    const parents: Record<string, string | null> = {};
    for (let i = 0; i < 50; i++) parents[`s${i}`] = `s${i + 1}`;
    parents.s50 = null;
    // The walk stops at the depth cap; the answer is still a real ancestor.
    const result = await resolveStoreSiteId("s0", lookup(parents));
    expect(result.startsWith("s")).toBe(true);
    expect(result).not.toBe("s0");
  });
});
