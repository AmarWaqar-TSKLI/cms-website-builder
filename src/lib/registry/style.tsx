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
