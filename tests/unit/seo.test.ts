import { describe, expect, it } from "vitest";
import { deriveDescription, robotsTxt, sitemapXml } from "../../src/lib/seo";
import type { LoadedRelease } from "../../src/lib/runtime/release";
import type { PageNode } from "../../src/lib/registry/types";

const LONG = "We roast single-origin beans in small batches every morning and deliver them to your door across the city, always within a day of roasting.";

const hero = (headline: string, subhead?: string): PageNode => ({
  id: "n1",
  type: "Hero",
  props: subhead ? { headline, subhead } : { headline },
  children: [],
});

describe("deriveDescription", () => {
  it("prefers paragraph copy (textarea props) at snippet length", () => {
    const out = deriveDescription([hero("Short headline here indeed", LONG)], {});
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.startsWith("We roast single-origin beans")).toBe(true);
  });

  it("returns empty for a page with no substantial text", () => {
    expect(deriveDescription([hero("Hi")], {})).toBe("");
  });
});

describe("sitemapXml", () => {
  const release = {
    createdAt: "2026-08-04T10:00:00.000Z",
    pages: {
      "/": { path: "/" },
      "/about": { path: "/about" },
    },
  } as unknown as LoadedRelease;

  it("lists absolute urls with the base path", () => {
    const xml = sitemapXml(release, "https://example.com", "/s/demo");
    expect(xml).toContain("<loc>https://example.com/s/demo</loc>");
    expect(xml).toContain("<loc>https://example.com/s/demo/about</loc>");
    expect(xml).toContain("<lastmod>2026-08-04</lastmod>");
  });

  it("root pages on a custom domain resolve to the bare origin", () => {
    const xml = sitemapXml(release, "https://golotto.com");
    expect(xml).toContain("<loc>https://golotto.com</loc>");
    expect(xml).toContain("<loc>https://golotto.com/about</loc>");
  });
});

describe("robotsTxt", () => {
  it("allows everything and names the sitemap", () => {
    const txt = robotsTxt("https://golotto.com");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Sitemap: https://golotto.com/sitemap.xml");
  });
});
