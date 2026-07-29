import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import {
  allSchemas,
  createNode,
  getComponent,
  getSchema,
  paletteFor,
} from "../../src/lib/registry";
import type { RenderContext } from "../../src/lib/registry/types";
import { embedUrl } from "../../src/lib/registry/blocks-media";
import { DEFAULT_TOKENS } from "../../src/lib/theme";

const ctx: RenderContext = {
  siteId: "site_1",
  siteName: "Test",
  releaseId: "rel_1",
  runtimeApi: "http://localhost:3000",
  tokens: DEFAULT_TOKENS,
  products: {
    p1: {
      id: "p1",
      title: "Product One",
      description: "",
      imageUrl: null,
      priceCents: 1234,
      variantId: "v1",
    },
  },
  collections: {
    c1: { id: "c1", title: "Featured", handle: "featured", productIds: ["p1"] },
  },
  media: { m1: { id: "m1", url: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", alt: "" } },
  posts: {},
  components: {},
};

describe("registry", () => {
  it("exposes the expected component set", () => {
    expect(allSchemas().map((s) => s.name).sort()).toEqual([
      // The shared-component reference is a real registry entry — that is what
      // gives it dependency extraction and rendering for free — but it is
      // `hidden`, so it never reaches the palette. Both facts are asserted here.
      "@component",
      "Button",
      "Callout",
      "Card",
      "Columns",
      "CtaBand",
      "Divider",
      "FaqItem",
      "Feature",
      "FeaturedProduct",
      "Gallery",
      "Heading",
      "Hero",
      "ImageBlock",
      "LogoStrip",
      "PostList",
      "PricingTier",
      "ProductGrid",
      "Quote",
      "Spacer",
      "Stat",
      "Testimonial",
      "TextBlock",
      "VideoEmbed",
    ]);

    expect(paletteFor(["commerce"]).map((s) => s.name)).not.toContain("@component");
  });

  it("gives every styleable component the shared style controls", () => {
    // The point of the shared style system: background, spacing, width and
    // alignment are editable on every block, not only the ones whose author
    // remembered to add a prop for it.
    for (const schema of allSchemas()) {
      if (schema.styleable === false) continue;
      for (const key of ["bgColor", "paddingTop", "paddingBottom", "contentWidth", "align"]) {
        expect(schema.props, `${schema.name} is missing ${key}`).toHaveProperty(key);
      }
    }
  });

  it("renders every component to HTML without throwing", () => {
    for (const schema of allSchemas()) {
      const entry = getComponent(schema.name)!;
      const node = createNode(schema.name, "n1");
      // Give ref props something real to resolve so nothing renders a placeholder.
      for (const [key, def] of Object.entries(schema.props)) {
        if (def.kind === "ref") {
          node.props[key] =
            def.ref === "collection" ? "c1" : def.ref === "media" ? "m1" : "p1";
        }
      }
      const html = renderToStaticMarkup(
        React.createElement(React.Fragment, null, entry.render({ node, props: node.props, ctx })),
      );
      expect(html, `${schema.name} produced no markup`).toBeTruthy();
      expect(html.length).toBeGreaterThan(10);
    }
  });

  it("renders a PostList with the chosen posts, and drops gone ones", () => {
    const entry = getComponent("PostList")!;
    const node = createNode("PostList", "n1");
    node.props.posts = ["post_1"];

    const withPost: RenderContext = {
      ...ctx,
      posts: {
        post_1: {
          id: "post_1",
          title: "Hello World Post",
          slug: "hello",
          excerpt: "A short summary.",
          body: "The full text.",
          publishedAt: "2026-01-02T00:00:00.000Z",
        },
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(React.Fragment, null, entry.render({ node, props: node.props, ctx: withPost })),
    );
    expect(html).toContain("Hello World Post");
    expect(html).toContain("A short summary.");

    // A post that was deleted or unpublished at build time is dropped, not shown.
    const goneCtx: RenderContext = {
      ...ctx,
      posts: {
        post_1: { id: "post_1", title: "Gone Post", slug: "g", excerpt: "", body: "", publishedAt: null, missing: true },
      },
    };
    const html2 = renderToStaticMarkup(
      React.createElement(React.Fragment, null, entry.render({ node, props: node.props, ctx: goneCtx })),
    );
    expect(html2).not.toContain("Gone Post");
  });

  it("resolves a name string to a component — the whole point of D1", () => {
    expect(getComponent("Hero")).toBeDefined();
    expect(getComponent("NotARealComponent")).toBeUndefined();
  });

  it("defaults every declared prop when creating a node", () => {
    for (const schema of allSchemas()) {
      const node = createNode(schema.name, "x");
      for (const key of Object.keys(schema.props)) {
        expect(node.props, `${schema.name}.${key} missing`).toHaveProperty(key);
      }
    }
  });

  it("stores a name and props — never markup", () => {
    const node = createNode("Hero", "n1");
    const serialized = JSON.stringify(node);
    expect(serialized).not.toMatch(/<[a-z]/i);
    expect(node.type).toBe("Hero");
  });

  it("filters the palette by enabled modules (D6)", () => {
    const engineOnly = paletteFor([]).map((s) => s.name);
    expect(engineOnly).not.toContain("ProductGrid");

    const withCommerce = paletteFor(["commerce"]).map((s) => s.name);
    expect(withCommerce).toContain("ProductGrid");

    // Engine components are always available regardless of modules.
    expect(engineOnly).toContain("Hero");
    expect(engineOnly).toContain("TextBlock");
  });

  it("renders a placeholder rather than crashing when live data is gone", () => {
    const entry = getComponent("ProductGrid")!;
    const node = createNode("ProductGrid", "n1");
    node.props.collection = "c_deleted";
    const missingCtx: RenderContext = {
      ...ctx,
      collections: {
        c_deleted: {
          id: "c_deleted",
          title: "(deleted)",
          handle: "",
          productIds: [],
          missing: true,
        },
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        entry.render({ node, props: node.props, ctx: missingCtx }),
      ),
    );
    expect(html).toContain("data-cms-missing");
  });

  it("emits add-to-cart hooks the runtime script can bind to (D8)", () => {
    const entry = getComponent("ProductGrid")!;
    const node = createNode("ProductGrid", "n1");
    node.props.collection = "c1";
    const html = renderToStaticMarkup(
      React.createElement(React.Fragment, null, entry.render({ node, props: node.props, ctx })),
    );
    expect(html).toContain('data-cms-add-to-cart="v1"');
  });

  it("declares ProductGrid as requiring the commerce module", () => {
    expect(getSchema("ProductGrid")?.requiresModule).toBe("commerce");
    expect(getSchema("Hero")?.requiresModule).toBeUndefined();
  });

  it("normalises video links and rejects ones it can't embed", () => {
    expect(embedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    expect(embedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    expect(embedUrl("https://vimeo.com/76979871")).toBe("https://player.vimeo.com/video/76979871");
    // Determinism: the same input always yields the same output (check #9 relies on this).
    expect(embedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(embedUrl("https://youtu.be/dQw4w9WgXcQ"));
    expect(embedUrl("")).toBeNull();
    expect(embedUrl("just some text")).toBeNull();
  });
});
