import { describe, expect, it } from "vitest";
import { serializeRelease, contentEtag } from "../../src/lib/content-api";
import { hashToken, looksLikeKey, mintKey } from "../../src/lib/apikeys";
import type { LoadedRelease } from "../../src/lib/runtime/release";
import type { PageNode } from "../../src/lib/registry/types";

/** A minimal but realistic release: one page that references a shared header
 *  component plus an inline hero, a full theme, and some frozen data. */
function fixture(): LoadedRelease {
  const headerRef: PageNode = {
    id: "ref1",
    type: "@component",
    props: { componentId: "cmp-header" },
    children: [],
  };
  const hero: PageNode = {
    id: "h1",
    type: "Hero",
    props: { headline: "Welcome", image: `data:image/png;base64,${"A".repeat(400)}` },
    children: [],
  };
  return {
    id: "rel1",
    versionNo: 3,
    siteId: "site1",
    siteName: "Startup",
    siteSlug: "startup",
    createdAt: "2026-08-02T00:00:00.000Z",
    tokens: {
      colorBg: "#fff",
      colorFg: "#000",
      colorMuted: "#888",
      colorAccent: "#0af",
      colorAccentFg: "#fff",
      colorSurface: "#f5f5f5",
      colorBorder: "#e5e5e5",
      fontHeading: "Inter",
      fontBody: "Inter",
      radius: "8px",
      maxWidth: "1100px",
    },
    layout: {
      nav: { brand: "Startup", links: [{ label: "Home", href: "/" }] },
      footer: { text: "© Startup", links: [] },
    },
    pages: {
      "/": { id: "p1", path: "/", title: "Home", root: [headerRef, hero], revisionId: "pr1" },
    },
    components: {
      "cmp-header": {
        id: "cmp-header",
        name: "Header",
        root: [{ id: "nav1", type: "Navbar", props: { brand: "Startup" }, children: [] }],
        revisionId: "cr1",
        missing: false,
      },
    },
    data: { products: {}, collections: {}, media: {}, posts: {}, frozenAt: "2026-08-02T00:00:00.000Z" },
  };
}

describe("serializeRelease", () => {
  it("unwraps @component references into their resolved blocks", () => {
    const out = serializeRelease(fixture());
    const types = out.pages[0].blocks.map((b) => b.type);
    // The @component wrapper is gone; the Navbar it resolved to is inline, in order.
    expect(types).toEqual(["Navbar", "Hero"]);
    expect(out.pages[0].blocks[0].props.brand).toBe("Startup");
  });

  it("exposes theme, nav and footer in a clean shape", () => {
    const out = serializeRelease(fixture());
    expect(out.site).toMatchObject({ name: "Startup", slug: "startup", version: 3 });
    expect(out.theme.colors.accent).toBe("#0af");
    expect(out.theme.fonts.heading).toBe("Inter");
    expect(out.nav.brand).toBe("Startup");
    expect(out.footer.text).toBe("© Startup");
  });

  it("truncates data-URIs by default and keeps them with embed=true", () => {
    const truncated = serializeRelease(fixture()).pages[0].blocks[1].props.image as string;
    expect(truncated).toMatch(/^data:image\/png;… \(\d+ bytes/);

    const embedded = serializeRelease(fixture(), true).pages[0].blocks[1].props.image as string;
    expect(embedded.startsWith("data:image/png;base64,")).toBe(true);
    expect(embedded.length).toBeGreaterThan(400);
  });
});

describe("contentEtag", () => {
  it("changes with version, embed and page — and is stable otherwise", () => {
    expect(contentEtag(3, false)).toBe(contentEtag(3, false));
    expect(contentEtag(3, false)).not.toBe(contentEtag(4, false)); // new release
    expect(contentEtag(3, false)).not.toBe(contentEtag(3, true)); // embed flips bytes
    expect(contentEtag(3, false, "/about")).not.toBe(contentEtag(3, false, "/")); // page filter
    expect(contentEtag(3, false)).toMatch(/^W\//); // weak validator
  });
});

describe("api key crypto", () => {
  it("mints a prefixed key and a stable hash of it", () => {
    const k = mintKey();
    expect(k.token.startsWith("cms_live_")).toBe(true);
    expect(looksLikeKey(k.token)).toBe(true);
    expect(k.hash).toBe(hashToken(k.token));
    // The stored hash is not the secret.
    expect(k.hash).not.toContain(k.token);
    // The display prefix is short and non-secret.
    expect(k.prefix.endsWith("…")).toBe(true);
    expect(k.prefix.length).toBeLessThan(k.token.length);
  });

  it("rejects malformed keys without a DB lookup", () => {
    expect(looksLikeKey("")).toBe(false);
    expect(looksLikeKey("nope")).toBe(false);
    expect(looksLikeKey("cms_live_short")).toBe(false);
  });

  it("gives different tokens on each mint", () => {
    expect(mintKey().token).not.toBe(mintKey().token);
  });
});
