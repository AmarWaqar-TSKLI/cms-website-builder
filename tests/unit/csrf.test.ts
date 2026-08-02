import { describe, expect, it } from "vitest";
import { isFirstParty } from "../../src/lib/api-auth";

/**
 * The CSRF gate on cookie-authenticated endpoints. `Sec-Fetch-Site` is the
 * primary signal; Origin-vs-Host is the fallback; no signal → allow (CSRF needs
 * a browser, and non-browser callers use bearer keys, not cookies).
 */
describe("isFirstParty (CSRF gate)", () => {
  it("allows same-origin and same-site fetches via Sec-Fetch-Site", () => {
    expect(isFirstParty("same-origin", null, null)).toBe(true);
    expect(isFirstParty("same-site", null, null)).toBe(true);
    expect(isFirstParty("none", null, null)).toBe(true); // top-level navigation
  });

  it("blocks cross-site fetches", () => {
    expect(isFirstParty("cross-site", null, null)).toBe(false);
    // Sec-Fetch-Site wins even if a matching Origin is spoofed alongside.
    expect(isFirstParty("cross-site", "https://app.example.com", "app.example.com")).toBe(false);
  });

  it("falls back to Origin vs Host when Sec-Fetch-Site is absent", () => {
    expect(isFirstParty(null, "https://app.example.com", "app.example.com")).toBe(true);
    expect(isFirstParty(null, "https://evil.example.net", "app.example.com")).toBe(false);
    expect(isFirstParty(null, "not-a-url", "app.example.com")).toBe(false);
  });

  it("allows when there is no browser signal at all", () => {
    expect(isFirstParty(null, null, "app.example.com")).toBe(true);
  });
});
