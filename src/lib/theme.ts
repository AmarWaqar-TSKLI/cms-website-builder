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

export function asTokens(value: unknown): ThemeTokens {
  return { ...DEFAULT_TOKENS, ...(value as object | null) } as ThemeTokens;
}

export function asLayout(value: unknown): ThemeLayout {
  const v = (value ?? {}) as Partial<ThemeLayout>;
  return {
    nav: v.nav ?? DEFAULT_LAYOUT.nav,
    footer: v.footer ?? DEFAULT_LAYOUT.footer,
  };
}
