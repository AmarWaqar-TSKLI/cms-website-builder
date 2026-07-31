import { describe, expect, it } from "vitest";
import { resolveHref } from "../../src/lib/registry/style";

/**
 * A site is served at two addresses — its own custom domain (where it is the
 * root) and the hosted /s/<slug> address (where it is not). Authors type links
 * as if the site were the root; resolveHref makes those links work at both.
 */
describe("resolveHref", () => {
  const base = "/s/acme-store";

  it("prefixes a root-relative same-site link with the base path", () => {
    expect(resolveHref(base, "/about")).toBe("/s/acme-store/about");
  });

  it("treats a bare link ('about') the same as '/about'", () => {
    expect(resolveHref(base, "about")).toBe("/s/acme-store/about");
  });

  it("handles arbitrarily deep paths", () => {
    expect(resolveHref(base, "/about/data/ggg")).toBe("/s/acme-store/about/data/ggg");
    expect(resolveHref(base, "about/data/ggg")).toBe("/s/acme-store/about/data/ggg");
  });

  it("keeps query strings and in-path anchors", () => {
    expect(resolveHref(base, "/about?x=1")).toBe("/s/acme-store/about?x=1");
    expect(resolveHref(base, "/about#team")).toBe("/s/acme-store/about#team");
  });

  it("maps the home link '/' to the base root", () => {
    expect(resolveHref(base, "/")).toBe("/s/acme-store/");
  });

  it("is a no-op on a custom domain (empty base)", () => {
    expect(resolveHref("", "/about")).toBe("/about");
    expect(resolveHref(undefined, "/about")).toBe("/about");
    // A bare link is still normalised to root-relative so it can't dangle.
    expect(resolveHref("", "about")).toBe("/about");
  });

  it("never double-slashes when the base has a trailing slash", () => {
    expect(resolveHref("/s/acme-store/", "/about")).toBe("/s/acme-store/about");
  });

  it("leaves external and non-navigational links untouched", () => {
    expect(resolveHref(base, "https://example.com/x")).toBe("https://example.com/x");
    expect(resolveHref(base, "http://example.com")).toBe("http://example.com");
    expect(resolveHref(base, "mailto:hi@example.com")).toBe("mailto:hi@example.com");
    expect(resolveHref(base, "tel:+123456")).toBe("tel:+123456");
    expect(resolveHref(base, "//cdn.example.com/a.js")).toBe("//cdn.example.com/a.js");
    expect(resolveHref(base, "#section")).toBe("#section");
  });

  it("collapses empty/'#' hrefs to '#'", () => {
    expect(resolveHref(base, "#")).toBe("#");
    expect(resolveHref(base, "")).toBe("#");
    expect(resolveHref(base, null)).toBe("#");
    expect(resolveHref(base, undefined)).toBe("#");
  });
});
