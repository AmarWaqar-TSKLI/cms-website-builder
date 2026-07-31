/**
 * Site chrome and base styles, as React.
 *
 * These used to be template literals producing HTML strings, because the only
 * consumer was a string-concatenating build step. Now there are two consumers —
 * the multi-tenant runtime rendering RSC, and the export still producing a file
 * — so they are components, and both paths render the identical tree.
 *
 * No "use client": none of this is interactive. Under RSC it never reaches the
 * browser as JavaScript at all, which is the point of the split.
 */
import React from "react";
import type { ThemeLayout, ThemeTokens } from "../../lib/registry/types";
import { resolveHref } from "../../lib/registry/style";

export function tokensToCss(t: ThemeTokens): string {
  return `:root{
  --cms-bg:${t.colorBg};
  --cms-fg:${t.colorFg};
  --cms-muted:${t.colorMuted};
  --cms-accent:${t.colorAccent};
  --cms-accent-fg:${t.colorAccentFg};
  --cms-surface:${t.colorSurface};
  --cms-border:${t.colorBorder};
  --cms-radius:${t.radius};
  --cms-max:${t.maxWidth};
}`;
}

export const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--cms-bg);color:var(--cms-fg);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{max-width:100%}
a{color:inherit}
button:disabled{opacity:.45;cursor:not-allowed}
@media (max-width:760px){
  [style*="grid-template-columns"]{grid-template-columns:1fr !important}
}
`.trim();

/**
 * The theme, as CSS custom properties, plus a minimal reset.
 *
 * Inline rather than a stylesheet link on purpose: an exported artifact opened
 * from file:// has to render completely with no network, and the runtime gets
 * the same bytes so the two paths cannot drift.
 */
export function SiteStyles({ tokens }: { tokens: ThemeTokens }) {
  return (
    <style
      dangerouslySetInnerHTML={{ __html: `${tokensToCss(tokens)}\n${BASE_CSS}` }}
    />
  );
}

export function SiteNav({
  layout,
  tokens: t,
  basePath = "",
}: {
  layout: ThemeLayout;
  tokens: ThemeTokens;
  basePath?: string;
}) {
  const nav = layout?.nav ?? { brand: "", links: [] };
  return (
    <div style={{ borderBottom: `1px solid ${t.colorBorder}`, background: t.colorBg }}>
      <div
        style={{
          maxWidth: t.maxWidth,
          margin: "0 auto",
          padding: "18px 24px",
          display: "flex",
          alignItems: "center",
          gap: 28,
          fontFamily: t.fontBody,
          color: t.colorFg,
        }}
      >
        <a
          href={resolveHref(basePath, "/")}
          style={{
            fontFamily: t.fontHeading,
            fontWeight: 680,
            fontSize: 17,
            letterSpacing: "-.02em",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          {nav.brand ?? ""}
        </a>
        <nav style={{ display: "flex", gap: 22, marginLeft: "auto" }}>
          {(nav.links ?? []).map((l, i) => (
            <a
              key={`${l.href}-${i}`}
              href={resolveHref(basePath, l.href)}
              style={{ color: "inherit", textDecoration: "none", opacity: 0.72, fontSize: 14 }}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function SiteFooter({
  layout,
  tokens: t,
  basePath = "",
}: {
  layout: ThemeLayout;
  tokens: ThemeTokens;
  basePath?: string;
}) {
  const f = layout?.footer ?? { text: "", links: [] };
  return (
    <div
      style={{
        borderTop: `1px solid ${t.colorBorder}`,
        background: t.colorSurface,
        marginTop: 64,
      }}
    >
      <div
        style={{
          maxWidth: t.maxWidth,
          margin: "0 auto",
          padding: "36px 24px",
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          alignItems: "center",
          fontFamily: t.fontBody,
          color: t.colorMuted,
          fontSize: 13,
        }}
      >
        <span>{f.text ?? ""}</span>
        <nav style={{ display: "flex", gap: 20, marginLeft: "auto" }}>
          {(f.links ?? []).map((l, i) => (
            <a
              key={`${l.href}-${i}`}
              href={resolveHref(basePath, l.href)}
              style={{ color: "inherit", textDecoration: "none", opacity: 0.6, fontSize: 13 }}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
