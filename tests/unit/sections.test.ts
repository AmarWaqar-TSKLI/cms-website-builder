import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { SECTION_TEMPLATES } from "../../src/lib/editor/sections";
import { getSchema, walk } from "../../src/lib/registry";
import { renderBody } from "../../src/lib/render";
import type { PageNode, RenderContext } from "../../src/lib/registry/types";
import { DEFAULT_TOKENS } from "../../src/lib/theme";

/**
 * Section templates are authored by hand as trees of ordinary blocks, so the two
 * ways to get them wrong are a mistyped block name and a mistyped prop key —
 * neither of which TypeScript catches, because a block is a string and props are
 * an open record. These tests close that gap: every node must resolve in the
 * registry, every prop must be one the block actually declares, and the whole
 * section must render to real markup. That last one is the strongest check — a
 * template that renders here renders identically in the editor and on the live
 * site, because all three go through the same registry.
 */

const ctx: RenderContext = {
  siteId: "site_1",
  siteName: "Test",
  releaseId: "rel_1",
  runtimeApi: "http://localhost:3000",
  tokens: DEFAULT_TOKENS,
  products: {},
  collections: {},
  media: {},
  posts: {},
  components: {},
};

/** Every node in a template, flattened (top-level blocks plus their children). */
function allNodes(blocks: PageNode[]): PageNode[] {
  const out: PageNode[] = [];
  walk(blocks, (n) => out.push(n));
  return out;
}

describe("section templates", () => {
  it("has a non-empty, uniquely-identified set", () => {
    expect(SECTION_TEMPLATES.length).toBeGreaterThan(0);
    const ids = SECTION_TEMPLATES.map((s) => s.id);
    expect(new Set(ids).size, "template ids must be unique").toBe(ids.length);
    for (const s of SECTION_TEMPLATES) {
      expect(s.blocks.length, `${s.id} has no blocks`).toBeGreaterThan(0);
      expect(s.label).toBeTruthy();
      expect(s.description).toBeTruthy();
    }
  });

  it("only uses block types that exist in the registry", () => {
    for (const s of SECTION_TEMPLATES) {
      for (const n of allNodes(s.blocks)) {
        expect(getSchema(n.type), `${s.id}: unknown block "${n.type}"`).toBeDefined();
      }
    }
  });

  it("only sets props each block actually declares (catches typos)", () => {
    for (const s of SECTION_TEMPLATES) {
      for (const n of allNodes(s.blocks)) {
        const schema = getSchema(n.type)!;
        for (const key of Object.keys(n.props)) {
          expect(
            schema.props,
            `${s.id}: block "${n.type}" has no prop "${key}"`,
          ).toHaveProperty(key);
        }
      }
    }
  });

  it("renders every template to real markup without throwing", () => {
    for (const s of SECTION_TEMPLATES) {
      const html = renderToStaticMarkup(
        React.createElement(React.Fragment, null, renderBody(s.blocks, ctx)),
      );
      expect(html, `${s.id} produced no markup`).toBeTruthy();
      expect(html.length, `${s.id} rendered suspiciously little`).toBeGreaterThan(40);
    }
  });

  it("renders the content it promises", () => {
    const byId = Object.fromEntries(SECTION_TEMPLATES.map((s) => [s.id, s]));
    const render = (id: string) =>
      renderToStaticMarkup(
        React.createElement(React.Fragment, null, renderBody(byId[id].blocks, ctx)),
      );

    // The highlighted middle pricing plan and its badge survive to the markup.
    const pricing = render("pricing-3");
    expect(pricing).toContain("$19");
    expect(pricing).toContain("Most popular");

    // FAQ questions render as real <summary> accordions (zero-JS <details>).
    const faq = render("faq");
    expect(faq).toContain("<details");
    expect(faq.toLowerCase()).toContain("do i need to know how to code");

    // The stats band shows its numbers.
    expect(render("stats-band")).toContain("99.9%");
  });
});
