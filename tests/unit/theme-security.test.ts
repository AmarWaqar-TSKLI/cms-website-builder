import { describe, expect, it } from "vitest";
import { DEFAULT_TOKENS, asTokens, sanitizeTokens } from "../../src/lib/theme";
import { tokensToCss } from "../../src/components/site/chrome";

/**
 * Theme tokens become raw CSS inside a <style> written with
 * dangerouslySetInnerHTML. A value that can carry `</style><script>` is a stored
 * XSS on every visitor of the published site. These tests are the guard: nothing
 * that isn't unmistakably a colour / font / length survives.
 */
describe("theme token sanitisation (stored-XSS guard)", () => {
  const XSS = "#fff}</style><script>alert(document.cookie)</script><style>{";

  it("drops a colour that tries to break out of the <style>", () => {
    const t = sanitizeTokens({ ...DEFAULT_TOKENS, colorBg: XSS });
    expect(t.colorBg).toBe(DEFAULT_TOKENS.colorBg);
    expect(t.colorBg).not.toContain("<");
  });

  it("drops a hostile font-family (no <>{}; allowed)", () => {
    const t = sanitizeTokens({ ...DEFAULT_TOKENS, fontHeading: "Inter</style><script>evil()</script>" });
    expect(t.fontHeading).toBe(DEFAULT_TOKENS.fontHeading);
  });

  it("drops a hostile radius / length", () => {
    const t = sanitizeTokens({ ...DEFAULT_TOKENS, radius: "12px;}body{background:url(javascript:alert(1))" });
    expect(t.radius).toBe(DEFAULT_TOKENS.radius);
  });

  it("keeps legitimate colours, fonts and lengths untouched", () => {
    const t = sanitizeTokens({
      ...DEFAULT_TOKENS,
      colorBg: "#1a1d23",
      colorAccent: "rgb(3, 169, 244)",
      colorFg: "midnightblue",
      fontBody: "'Helvetica Neue', Arial, sans-serif",
      radius: "8px",
      maxWidth: "1200px",
    });
    expect(t.colorBg).toBe("#1a1d23");
    expect(t.colorAccent).toBe("rgb(3, 169, 244)");
    expect(t.colorFg).toBe("midnightblue");
    expect(t.fontBody).toBe("'Helvetica Neue', Arial, sans-serif");
    expect(t.radius).toBe("8px");
    expect(t.maxWidth).toBe("1200px");
  });

  it("asTokens sanitises on the way in (storage is safe)", () => {
    const t = asTokens({ colorFg: XSS, colorAccent: "'; }</style><script>x</script>" });
    expect(t.colorFg).toBe(DEFAULT_TOKENS.colorFg);
    expect(t.colorAccent).toBe(DEFAULT_TOKENS.colorAccent);
  });

  it("the rendered CSS can never contain </style> or a <script> tag", () => {
    const css = tokensToCss({ ...DEFAULT_TOKENS, colorBg: XSS, fontHeading: "a</style><script>1</script>" });
    expect(css.toLowerCase()).not.toContain("</style>");
    expect(css.toLowerCase()).not.toContain("<script");
    expect(css).not.toContain("<");
  });
});
