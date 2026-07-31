/**
 * CONTENT BLOCKS.
 *
 * The everyday building blocks beyond a plain heading and paragraph: an image +
 * text feature split, a collapsible FAQ item, a pull-quote, and a coloured
 * callout. Same rules as everything in the palette (I16): pure render functions,
 * inline-styled from theme tokens, wrapped in Section.
 *
 * Two things worth pointing at:
 *  - Feature lays out with flex-wrap and a min-width on each half, so it stacks
 *    on a narrow screen with no media query — the one responsive pattern that
 *    survives the "inline styles only" rule (I4).
 *  - FaqItem is a native <details>. That is a real accordion with zero
 *    JavaScript, so it works identically in the build worker, the editor canvas
 *    and an exported page opened from file://. It only forces itself open while
 *    editing (ctx.editing) so the answer stays double-click editable.
 */
import React from "react";
import {
  MissingRef,
  Section,
  alignOf,
  buttonStyle,
  resolveHref,
  withStyleProps,
} from "./style";
import type { RegistryEntry, RenderProps } from "./types";

// ─────────────────────────────────────────────────────────────── Feature ─────

const Feature: RegistryEntry = {
  schema: {
    name: "Feature",
    label: "Feature",
    description: "An image beside a headline, text and a button.",
    category: "content",
    icon: "◧",
    props: withStyleProps({
      media: {
        label: "Image",
        kind: "ref",
        ref: "media",
        default: "",
        help: "The picture shown next to the text.",
      },
      mediaSide: {
        label: "Image on the",
        kind: "segment",
        default: "left",
        options: [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ],
      },
      eyebrow: { label: "Small label", kind: "text", default: "", inlineEditable: true },
      heading: { label: "Headline", kind: "text", default: "A feature worth showing", inlineEditable: true },
      body: {
        label: "Text",
        kind: "textarea",
        default: "Explain the one thing this section is about, in a sentence or two.",
        inlineEditable: true,
      },
      ctaLabel: { label: "Button label", kind: "text", default: "" },
      ctaHref: { label: "Button link", kind: "url", default: "#" },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const m = props.media ? ctx.media[props.media as string] : undefined;
    const imageRight = props.mediaSide === "right";

    const mediaEl = (
      <div style={{ flex: "1 1 300px", minWidth: 0 }}>
        {m && !m.missing ? (
          <img
            src={m.url}
            alt={m.alt}
            style={{ width: "100%", height: "auto", display: "block", borderRadius: t.radius }}
          />
        ) : (
          <MissingRef t={t} label="Pick an image in the panel on the right." />
        )}
      </div>
    );

    const textEl = (
      <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: "14px", justifyContent: "center" }}>
        {props.eyebrow ? (
          <div
            data-cms-prop="eyebrow"
            style={{
              fontFamily: t.fontBody,
              fontSize: "12.5px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: t.colorAccent,
            }}
          >
            {String(props.eyebrow)}
          </div>
        ) : null}
        <h2
          data-cms-prop="heading"
          style={{
            fontFamily: t.fontHeading,
            fontSize: "clamp(24px, 3vw, 34px)",
            fontWeight: 660,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {String(props.heading ?? "")}
        </h2>
        {props.body ? (
          <p
            data-cms-prop="body"
            style={{ fontFamily: t.fontBody, fontSize: "16px", lineHeight: 1.6, margin: 0, opacity: 0.82, maxWidth: "52ch" }}
          >
            {String(props.body)}
          </p>
        ) : null}
        {props.ctaLabel ? (
          <div style={{ marginTop: "4px" }}>
            <a href={resolveHref(ctx.basePath, String(props.ctaHref || "#"))} style={buttonStyle(t, "solid", "md")}>
              {String(props.ctaLabel)}
            </a>
          </div>
        ) : null}
      </div>
    );

    return (
      <Section props={props} tokens={t}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "44px", alignItems: "center" }}>
          {imageRight ? (
            <>
              {textEl}
              {mediaEl}
            </>
          ) : (
            <>
              {mediaEl}
              {textEl}
            </>
          )}
        </div>
      </Section>
    );
  },
};

// ─────────────────────────────────────────────────────────────── FaqItem ─────

const FaqItem: RegistryEntry = {
  schema: {
    name: "FaqItem",
    label: "FAQ item",
    description: "A question that expands to show its answer. Stack a few.",
    category: "content",
    icon: "?",
    props: withStyleProps({
      question: { label: "Question", kind: "text", default: "How does this work?", inlineEditable: true },
      answer: {
        label: "Answer",
        kind: "textarea",
        default: "Answer the question plainly here. Visitors can tap the question to open it.",
        inlineEditable: true,
      },
      defaultOpen: {
        label: "Open by default",
        kind: "boolean",
        default: false,
        help: "Show the answer without the visitor having to click.",
      },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    // Forced open while editing so the answer stays visible and editable; on the
    // live page it follows the author's "open by default" choice.
    const open = Boolean(ctx.editing) || Boolean(props.defaultOpen);
    return (
      <Section props={props} tokens={t}>
        <details open={open} style={{ borderBottom: `1px solid ${t.colorBorder}` }}>
          <summary
            data-cms-prop="question"
            style={{
              cursor: "pointer",
              listStyle: "none",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "16px",
              padding: "16px 2px",
              fontFamily: t.fontHeading,
              fontSize: "17px",
              fontWeight: 620,
              letterSpacing: "-0.01em",
            }}
          >
            <span>{String(props.question ?? "")}</span>
            <span aria-hidden style={{ color: t.colorMuted, fontSize: "15px" }}>⌄</span>
          </summary>
          <div
            data-cms-prop="answer"
            style={{
              padding: "0 2px 18px",
              fontFamily: t.fontBody,
              fontSize: "15px",
              lineHeight: 1.6,
              opacity: 0.82,
              maxWidth: "68ch",
              whiteSpace: "pre-wrap",
            }}
          >
            {String(props.answer ?? "")}
          </div>
        </details>
      </Section>
    );
  },
};

// ───────────────────────────────────────────────────────────────── Quote ─────

const Quote: RegistryEntry = {
  schema: {
    name: "Quote",
    label: "Quote",
    description: "A large pull-quote with an attribution.",
    category: "content",
    icon: "❞",
    props: withStyleProps({
      text: {
        label: "Quote",
        kind: "textarea",
        default: "The best way to predict the future is to invent it.",
        inlineEditable: true,
      },
      attribution: { label: "Attributed to", kind: "text", default: "Alan Kay", inlineEditable: true },
      size: { label: "Quote size", kind: "range", default: 30, min: 18, max: 56, step: 2, unit: "px" },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const align = alignOf(props);
    return (
      <Section props={props} tokens={t}>
        <figure style={{ margin: 0, textAlign: align }}>
          <blockquote
            data-cms-prop="text"
            style={{
              margin: 0,
              fontFamily: t.fontHeading,
              fontSize: `clamp(22px, 4vw, ${Number(props.size ?? 30)}px)`,
              lineHeight: 1.3,
              fontWeight: 560,
              letterSpacing: "-0.02em",
              maxWidth: "24ch",
              marginLeft: align === "center" ? "auto" : align === "right" ? "auto" : 0,
              marginRight: align === "center" ? "auto" : 0,
            }}
          >
            <span aria-hidden style={{ color: t.colorAccent }}>“</span>
            {String(props.text ?? "")}
            <span aria-hidden style={{ color: t.colorAccent }}>”</span>
          </blockquote>
          {props.attribution ? (
            <figcaption
              data-cms-prop="attribution"
              style={{
                marginTop: "18px",
                fontFamily: t.fontBody,
                fontSize: "14px",
                fontWeight: 600,
                color: t.colorMuted,
              }}
            >
              — {String(props.attribution)}
            </figcaption>
          ) : null}
        </figure>
      </Section>
    );
  },
};

// ─────────────────────────────────────────────────────────────── Callout ─────

/** The left-bar colour for each tone. Surface stays the theme's; only the bar
 *  carries the meaning, so a callout never fights the site's palette. */
const CALLOUT_TONE: Record<string, (accent: string, border: string) => string> = {
  accent: (accent) => accent,
  neutral: (_accent, border) => border,
  positive: () => "#0f766e",
  caution: () => "#b45309",
};

const Callout: RegistryEntry = {
  schema: {
    name: "Callout",
    label: "Callout",
    description: "A boxed note that stands out from the text around it.",
    category: "content",
    icon: "◆",
    props: withStyleProps({
      title: { label: "Title", kind: "text", default: "Good to know", inlineEditable: true },
      body: {
        label: "Text",
        kind: "textarea",
        default: "Use a callout to draw the eye to something that matters.",
        inlineEditable: true,
      },
      tone: {
        label: "Tone",
        kind: "segment",
        default: "accent",
        options: [
          { value: "accent", label: "Accent" },
          { value: "neutral", label: "Neutral" },
          { value: "positive", label: "Positive" },
          { value: "caution", label: "Caution" },
        ],
      },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const tone = CALLOUT_TONE[String(props.tone ?? "accent")] ?? CALLOUT_TONE.accent;
    const bar = tone(t.colorAccent, t.colorBorder);
    return (
      <Section props={props} tokens={t}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            background: t.colorSurface,
            borderRadius: t.radius,
            borderLeft: `4px solid ${bar}`,
            padding: "18px 22px",
            textAlign: "left",
          }}
        >
          {props.title ? (
            <div data-cms-prop="title" style={{ fontFamily: t.fontHeading, fontSize: "16px", fontWeight: 640, letterSpacing: "-0.01em" }}>
              {String(props.title)}
            </div>
          ) : null}
          {props.body ? (
            <p
              data-cms-prop="body"
              style={{ fontFamily: t.fontBody, fontSize: "14.5px", lineHeight: 1.6, margin: 0, opacity: 0.82, whiteSpace: "pre-wrap" }}
            >
              {String(props.body)}
            </p>
          ) : null}
        </div>
      </Section>
    );
  },
};

export const CONTENT_BLOCKS: RegistryEntry[] = [Feature, FaqItem, Quote, Callout];
