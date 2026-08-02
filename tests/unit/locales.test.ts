import { describe, expect, it } from "vitest";
import { isRtl, localeOf, stripLocale, withLocale, LOCALE_CODES } from "../../src/lib/locales";

describe("locale path helpers", () => {
  it("detects the locale from a path's first segment", () => {
    expect(localeOf("/es")).toBe("es");
    expect(localeOf("/fr/about")).toBe("fr");
    expect(localeOf("/ar/contact/us")).toBe("ar");
  });

  it("returns null for the default (untranslated) pages", () => {
    expect(localeOf("/")).toBeNull();
    expect(localeOf("/about")).toBeNull();
    // "en" isn't in the catalogue, so it's treated as ordinary content, not a locale.
    expect(localeOf("/enterprise")).toBeNull();
    expect(LOCALE_CODES.has("en")).toBe(false);
  });

  it("strips a locale prefix back to the logical path", () => {
    expect(stripLocale("/fr")).toBe("/");
    expect(stripLocale("/fr/about")).toBe("/about");
    expect(stripLocale("/ar/contact/us")).toBe("/contact/us");
    expect(stripLocale("/about")).toBe("/about"); // no-op on default pages
  });

  it("is the inverse of withLocale", () => {
    for (const logical of ["/", "/about", "/contact/us"]) {
      expect(stripLocale(withLocale("fr", logical))).toBe(logical);
    }
    expect(withLocale("es", "/")).toBe("/es");
    expect(withLocale("es", "/about")).toBe("/es/about");
  });

  it("flags right-to-left locales", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("es")).toBe(false);
    expect(isRtl("ja")).toBe(false);
  });
});
