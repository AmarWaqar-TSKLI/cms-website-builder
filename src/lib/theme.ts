import type { ThemeLayout, ThemeTokens } from "./registry/types";

/**
 * Fallback theme. Real values live in theme_revisions and are pinned per
 * release, so a rollback restores the old tokens too. This is only used when a
 * site has no theme yet.
 */
export const DEFAULT_TOKENS: ThemeTokens = {
  colorBg: "#ffffff",
  colorFg: "#0b0b0f",
  colorMuted: "#6b6b76",
  colorAccent: "#0b0b0f",
  colorAccentFg: "#ffffff",
  colorSurface: "#f6f6f7",
  colorBorder: "#e4e4e7",
  fontHeading: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontBody: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  radius: "12px",
  maxWidth: "1120px",
};

export const DEFAULT_LAYOUT: ThemeLayout = {
  nav: {
    brand: "Acme",
    links: [
      { label: "Shop", href: "/" },
      { label: "About", href: "/about" },
    ],
  },
  footer: {
    text: "© Acme — built from a description, not a document.",
    links: [{ label: "About", href: "/about" }],
  },
};

/**
 * Theme tokens become raw CSS — `--cms-bg:<value>` inside a <style> written with
 * dangerouslySetInnerHTML (chrome.tsx). So a value is an injection sink: a colour
 * of `#fff}</style><script>…</script>` would break out of the style element and
 * run script on every visitor of the published site, on their own domain. These
 * validators are the fix: a value that isn't unmistakably a colour / font stack /
 * length is dropped for the safe default, so nothing that reaches CSS can contain
 * the characters needed to escape it (`<` `>` `{` `}` `;` quotes are all rejected).
 */
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(?:rgb|rgba|hsl|hsla)\(\s*[\d.,%\s/]+\))$/;
const SAFE_FONT = /^[a-zA-Z0-9 ,'"-]{1,200}$/;
const SAFE_LENGTH = /^(0|\d{1,5}(px|rem|em|%|vw|vh|ch))$/;

const COLOR_KEYS = [
  "colorBg",
  "colorFg",
  "colorMuted",
  "colorAccent",
  "colorAccentFg",
  "colorSurface",
  "colorBorder",
] as const;

/** Replace any token value that isn't safely a colour/font/length with its default. */
export function sanitizeTokens(tokens: ThemeTokens): ThemeTokens {
  const safe = (value: unknown, ok: RegExp, fallback: string) =>
    typeof value === "string" && ok.test(value.trim()) ? value.trim() : fallback;

  const out: ThemeTokens = { ...tokens };
  for (const k of COLOR_KEYS) out[k] = safe(tokens[k], SAFE_COLOR, DEFAULT_TOKENS[k]);
  out.fontHeading = safe(tokens.fontHeading, SAFE_FONT, DEFAULT_TOKENS.fontHeading);
  out.fontBody = safe(tokens.fontBody, SAFE_FONT, DEFAULT_TOKENS.fontBody);
  out.radius = safe(tokens.radius, SAFE_LENGTH, DEFAULT_TOKENS.radius);
  out.maxWidth = safe(tokens.maxWidth, SAFE_LENGTH, DEFAULT_TOKENS.maxWidth);
  return out;
}

export function asTokens(value: unknown): ThemeTokens {
  // Sanitise on the way in, so a malformed or hostile value can never be stored.
  return sanitizeTokens({ ...DEFAULT_TOKENS, ...(value as object | null) } as ThemeTokens);
}

export function asLayout(value: unknown): ThemeLayout {
  const v = (value ?? {}) as Partial<ThemeLayout>;
  return {
    nav: v.nav ?? DEFAULT_LAYOUT.nav,
    footer: v.footer ?? DEFAULT_LAYOUT.footer,
  };
}
