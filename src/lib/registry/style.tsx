/**
 * THE SHARED STYLE SYSTEM.
 *
 * Every visual component gets the same set of style props merged into its
 * schema, so "can I change the background of this block?" has one answer —
 * yes — instead of depending on whether someone remembered to add a prop.
 *
 * This is what stops the palette being a set of fixed, take-it-or-leave-it
 * blocks. The component author writes the CONTENT; layout, colour, spacing and
 * width are the user's, on every block, for free.
 *
 * Because these are ordinary props, they are stored in the same JSON body, they
 * version with the page, and they roll back with it. Nothing special.
 */
// Explicit React import: the worker and the test runner compile this file with
// the classic JSX transform (tsconfig keeps jsx:"preserve" for Next's pipeline).
import React from "react";
import type { CSSProperties, ReactNode } from "react";
import type { PropDef, ThemeTokens } from "./types";

export const WIDTHS = {
  narrow: "720px",
  normal: "",   // falls back to the theme's max width
  wide: "1320px",
  full: "100%",
} as const;

/** Merged into every styleable component's schema. */
export const STYLE_PROPS: Record<string, PropDef> = {
  bgColor: {
    label: "Background",
    kind: "color",
    default: "",
    group: "style",
    help: "Empty means inherit from the theme.",
  },
  fgColor: { label: "Text colour", kind: "color", default: "", group: "style" },
  bgImage: { label: "Background image", kind: "ref", ref: "media", default: "", group: "style" },
  bgOverlay: {
    label: "Image darkening",
    kind: "range",
    default: 55,
    min: 0,
    max: 90,
    step: 5,
    unit: "%",
    group: "style",
    showIf: (p) => Boolean(p.bgImage),
  },
  paddingTop: {
    label: "Space above",
    kind: "range",
    default: 56,
    min: 0,
    max: 200,
    step: 4,
    unit: "px",
    group: "layout",
  },
  paddingBottom: {
    label: "Space below",
    kind: "range",
    default: 56,
    min: 0,
    max: 200,
    step: 4,
    unit: "px",
    group: "layout",
  },
  contentWidth: {
    label: "Content width",
    kind: "segment",
    default: "normal",
    group: "layout",
    options: [
      { value: "narrow", label: "Narrow" },
      { value: "normal", label: "Normal" },
      { value: "wide", label: "Wide" },
      { value: "full", label: "Full" },
    ],
  },
  align: {
    label: "Alignment",
    kind: "segment",
    default: "left",
    group: "layout",
    options: [
      { value: "left", label: "Left" },
      { value: "center", label: "Centre" },
      { value: "right", label: "Right" },
    ],
  },
  radius: {
    label: "Corner radius",
    kind: "range",
    default: 0,
    min: 0,
    max: 48,
    step: 2,
    unit: "px",
    group: "style",
  },
  borderTop: { label: "Line above", kind: "boolean", default: false, group: "style" },
  borderBottom: { label: "Line below", kind: "boolean", default: false, group: "style" },
};

export function withStyleProps(props: Record<string, PropDef>): Record<string, PropDef> {
  return { ...props, ...STYLE_PROPS };
}

export type Align = "left" | "center" | "right";

export function alignOf(props: Record<string, any>): Align {
  const a = props.align;
  return a === "center" || a === "right" ? a : "left";
}

/**
 * A styled section wrapper. Every visual component renders inside one of these,
 * which is what makes the style controls universal rather than per-component.
 */
export function Section({
  props,
  tokens,
  mediaUrl,
  children,
  innerStyle,
}: {
  props: Record<string, any>;
  tokens: ThemeTokens;
  /** Resolved URL for the bgImage ref, if any. */
  mediaUrl?: string;
  children: ReactNode;
  innerStyle?: CSSProperties;
}) {
  const align = alignOf(props);
  const width = (props.contentWidth ?? "normal") as keyof typeof WIDTHS;
  const maxWidth = width === "normal" ? tokens.maxWidth : WIDTHS[width] || tokens.maxWidth;
  const overlay = Number(props.bgOverlay ?? 55) / 100;

  const outer: CSSProperties = {
    paddingTop: `${Number(props.paddingTop ?? 56)}px`,
    paddingBottom: `${Number(props.paddingBottom ?? 56)}px`,
    color: props.fgColor || (mediaUrl ? "#ffffff" : tokens.colorFg),
    borderRadius: Number(props.radius ?? 0) ? `${Number(props.radius)}px` : undefined,
    borderTop: props.borderTop ? `1px solid ${tokens.colorBorder}` : undefined,
    borderBottom: props.borderBottom ? `1px solid ${tokens.colorBorder}` : undefined,
    overflow: Number(props.radius ?? 0) ? "hidden" : undefined,
    background: mediaUrl
      ? `linear-gradient(rgba(9,9,11,${overlay}),rgba(9,9,11,${overlay})), url(${mediaUrl}) center/cover`
      : props.bgColor || tokens.colorBg,
  };

  const inner: CSSProperties = {
    maxWidth,
    marginLeft: "auto",
    marginRight: "auto",
    paddingLeft: width === "full" ? 0 : "24px",
    paddingRight: width === "full" ? 0 : "24px",
    textAlign: align,
    ...innerStyle,
  };

  return (
    <section style={outer}>
      <div style={inner}>{children}</div>
    </section>
  );
}

/** Flex justification matching a text alignment — for rows of buttons/cards. */
export function justifyFor(align: Align): CSSProperties["justifyContent"] {
  return align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
}

/**
 * A responsive grid track template: about `n` columns on a roomy screen,
 * collapsing to ONE on a phone — with no media query, so it stays within the
 * "inline styles only" rule (I4) and an exported page still stacks correctly from
 * file://. The trick is `min(basis, 100%)`: once the viewport is narrower than a
 * single track, the track becomes 100% and the grid drops to one column.
 * `auto-fit` collapses any empty tracks, so a container with two children still
 * fills the row rather than leaving a gap.
 */
export function autoGrid(n: number): string {
  const basis = n >= 4 ? 190 : n === 3 ? 230 : 300;
  return `repeat(auto-fit, minmax(min(${basis}px, 100%), 1fr))`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared block primitives.
//
// These used to live inside components.tsx. They moved here so the per-category
// block files (marketing, content, commerce, forms) can share them without a
// circular import back through the aggregating module. Pure functions, no state.
// ─────────────────────────────────────────────────────────────────────────────

/** Cents → "$12.34". The one place price formatting is decided. */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Shown wherever live data referenced by a frozen page has since been deleted,
 * or wherever a block needs the user to pick something in the panel. A visible
 * placeholder, never a thrown error — that is D5's accepted cost made graceful.
 */
export function MissingRef({ t, label }: { t: ThemeTokens; label: string }): ReactNode {
  return (
    <div
      data-cms-missing="1"
      style={{
        border: `1px dashed ${t.colorBorder}`,
        borderRadius: t.radius,
        padding: "20px 24px",
        color: t.colorMuted,
        fontSize: "14px",
        background: t.colorSurface,
        textAlign: "center",
      }}
    >
      {label}
    </div>
  );
}

/** The button look shared by Hero, Button, CTA band and the form blocks. */
export function buttonStyle(t: ThemeTokens, variant: string, size: string): CSSProperties {
  const pad =
    size === "sm" ? "9px 18px" : size === "lg" ? "16px 34px" : "13px 26px";
  const font = size === "sm" ? "13px" : size === "lg" ? "16px" : "15px";
  const base: CSSProperties = {
    display: "inline-block",
    padding: pad,
    borderRadius: t.radius,
    fontFamily: t.fontBody,
    fontWeight: 600,
    fontSize: font,
    textDecoration: "none",
    cursor: "pointer",
    border: "1px solid transparent",
  };
  if (variant === "outline") {
    return { ...base, background: "transparent", color: "inherit", borderColor: "currentColor" };
  }
  if (variant === "ghost") {
    return { ...base, background: "transparent", color: "inherit", padding: `0 0 4px`, borderRadius: 0, borderBottom: "2px solid currentColor" };
  }
  return { ...base, background: t.colorAccent, color: t.colorAccentFg };
}

/**
 * Resolve a link the way the site author meant it.
 *
 * Authors type a destination as if their site were at the root — "/about",
 * "about", "/about/team/x" all mean "the about page of THIS site". That is true
 * on a custom domain, where the site IS the root. But the same site is also
 * served at /s/<slug>, and there a bare "/about" would leave the site entirely
 * and hit the app. So every internal link carries a base prefix: "" on a custom
 * domain (unchanged), "/s/<slug>" on the hosted address.
 *
 * External and non-navigational links — a full URL, mailto:, tel:, a protocol-
 * relative //host, an in-page #anchor, or the empty "#" — are returned exactly
 * as authored. Only a same-site path is rewritten.
 */
export function resolveHref(basePath: string | undefined, href: string | null | undefined): string {
  const raw = (href ?? "").trim();
  if (!raw || raw === "#") return "#";
  // Anything with a scheme (http:, mailto:, tel:…), protocol-relative, or an
  // in-page anchor is left untouched — it isn't a same-site path.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//") || raw.startsWith("#")) {
    return raw;
  }
  const base = (basePath ?? "").replace(/\/+$/, "");
  // Normalise "about" and "/about" to one leading slash, then carry the prefix.
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base}${path}`;
}
