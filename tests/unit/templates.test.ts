import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { TEMPLATES, getTemplate } from "../../src/lib/templates";
import { getSchema, walk } from "../../src/lib/registry";
import { renderBody } from "../../src/lib/render";
import { DEFAULT_TOKENS } from "../../src/lib/theme";
import type { PageNode, RenderContext, ThemeTokens } from "../../src/lib/registry/types";

/**
 * Templates are hand-authored trees of ordinary blocks, so — exactly like the
 * section templates — the ways to get them wrong are a mistyped block name or a
 * mistyped prop, neither of which the type-checker catches. These tests close
 * that gap and prove every page of every template renders. They also render
 * under each template's OWN theme tokens, so a broken token can't hide.
 */
function ctxWith(tokens: ThemeTokens): RenderContext {
  return {
    siteId: "s",
    siteName: "T",
    releaseId: "r",
    runtimeApi: "http://localhost:3000",
    tokens,
    products: {},
    collections: {},
    media: {},
    posts: {},
    components: {},
  };
}

const allNodes = (blocks: PageNode[]): PageNode[] => {
  const out: PageNode[] = [];
  walk(blocks, (n) => out.push(n));
  return out;
};

describe("site templates", () => {
  it("has a non-empty, uniquely-identified set with home pages", () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TEMPLATES) {
      expect(t.name).toBeTruthy();
      expect(t.tagline).toBeTruthy();
      expect(t.pages.length).toBeGreaterThan(0);
      // Every template must have a "/" so the editor has a home to open.
      expect(t.pages.some((p) => p.path === "/"), `${t.id} has no home page`).toBe(true);
      expect(getTemplate(t.id)).toBe(t);
    }
  });

  it("only uses real block types and real props", () => {
    for (const t of TEMPLATES) {
      for (const page of t.pages) {
        for (const n of allNodes(page.blocks)) {
          const schema = getSchema(n.type);
          expect(schema, `${t.id}${page.path}: unknown block "${n.type}"`).toBeDefined();
          for (const key of Object.keys(n.props)) {
            expect(schema!.props, `${t.id}${page.path}: "${n.type}" has no prop "${key}"`).toHaveProperty(key);
          }
        }
      }
    }
  });

  it("renders every page of every template to real markup", () => {
    for (const t of TEMPLATES) {
      const ctx = ctxWith({ ...DEFAULT_TOKENS, ...t.tokens });
      for (const page of t.pages) {
        const html = renderToStaticMarkup(
          React.createElement(React.Fragment, null, renderBody(page.blocks, ctx)),
        );
        expect(html.length, `${t.id}${page.path} rendered too little`).toBeGreaterThan(80);
      }
    }
  });

  it("leaves no 'pick an image' placeholders — templates look complete out of the box", () => {
    for (const t of TEMPLATES) {
      const ctx = ctxWith({ ...DEFAULT_TOKENS, ...t.tokens });
      for (const page of t.pages) {
        const html = renderToStaticMarkup(
          React.createElement(React.Fragment, null, renderBody(page.blocks, ctx)),
        );
        expect(html, `${t.id}${page.path} has a missing-media placeholder`).not.toContain("data-cms-missing");
      }
    }
  });
});
