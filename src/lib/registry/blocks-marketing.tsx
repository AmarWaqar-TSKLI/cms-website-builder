/**
 * MARKETING BLOCKS.
 *
 * The blocks a landing page is built from: a call-to-action band, a single
 * testimonial, a headline statistic, and a strip of customer logos. Each is the
 * same kind of thing the original six were (D1, I16) — a pure render function,
 * inline-styled from theme tokens, wrapped in the shared Section so background,
 * spacing, width and alignment come for free and roll back with the page.
 *
 * Testimonials, stats and pricing plans are deliberately SINGLE blocks: you drop
 * several into a Columns row rather than the block owning an array of items. That
 * keeps them inside the prop system (which has no repeater kind) and consistent
 * with how Card already works — one card, placed as many times as you like.
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
import type { RegistryEntry, RenderProps, ResolvedMedia } from "./types";

/** Flexbox cross-axis position matching a text alignment. */
function itemsFor(align: "left" | "center" | "right"): "flex-start" | "center" | "flex-end" {
  return align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
}

// ─────────────────────────────────────────────────────────────── CtaBand ─────

const CtaBand: RegistryEntry = {
  schema: {
    name: "CtaBand",
    label: "Call to action",
    description: "A bold band that asks the visitor to do one thing.",
    category: "marketing",
    icon: "►",
    props: withStyleProps({
      headline: {
        label: "Headline",
        kind: "text",
        default: "Ready to get started?",
        inlineEditable: true,
      },
      subhead: {
        label: "Supporting line",
        kind: "textarea",
        default: "Set up your first page in minutes — no code, no fuss.",
        inlineEditable: true,
      },
      ctaLabel: { label: "Button label", kind: "text", default: "Get started" },
      ctaHref: { label: "Button link", kind: "url", default: "/products" },
      ctaVariant: {
        label: "Button style",
        kind: "segment",
        default: "solid",
        options: [
          { value: "solid", label: "Solid" },
          { value: "outline", label: "Outline" },
          { value: "ghost", label: "Text" },
        ],
      },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const align = alignOf(props);
    const bg = props.bgImage ? ctx.media[props.bgImage as string] : undefined;
    return (
      <Section props={props} tokens={t} mediaUrl={bg && !bg.missing ? bg.url : undefined}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: itemsFor(align) }}>
          <h2
            data-cms-prop="headline"
            style={{
              fontFamily: t.fontHeading,
              fontSize: "clamp(24px, 3.4vw, 40px)",
              fontWeight: 680,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            {String(props.headline ?? "")}
          </h2>
          {props.subhead ? (
            <p
              data-cms-prop="subhead"
              style={{
                fontFamily: t.fontBody,
                fontSize: "clamp(15px, 1.4vw, 18px)",
                lineHeight: 1.55,
                margin: 0,
                maxWidth: "56ch",
                opacity: 0.82,
              }}
            >
              {String(props.subhead)}
            </p>
          ) : null}
          {props.ctaLabel ? (
            <div style={{ marginTop: "6px" }}>
              <a href={resolveHref(ctx.basePath, String(props.ctaHref || "#"))} style={buttonStyle(t, String(props.ctaVariant ?? "solid"), "lg")}>
                {String(props.ctaLabel)}
              </a>
            </div>
          ) : null}
        </div>
      </Section>
    );
  },
};

// ──────────────────────────────────────────────────────────── Testimonial ────

const Testimonial: RegistryEntry = {
  schema: {
    name: "Testimonial",
    label: "Testimonial",
    description: "A single customer quote, with a name and photo.",
    category: "marketing",
    icon: "❝",
    props: withStyleProps({
      quote: {
        label: "Quote",
        kind: "textarea",
        default: "This changed how our whole team works. Honestly couldn't go back.",
        inlineEditable: true,
      },
      author: { label: "Name", kind: "text", default: "Alex Rivera", inlineEditable: true },
      role: { label: "Role / company", kind: "text", default: "Founder, Northwind", inlineEditable: true },
      avatar: {
        label: "Photo",
        kind: "ref",
        ref: "media",
        default: "",
        help: "An optional headshot from your media library.",
      },
      rating: {
        label: "Stars",
        kind: "range",
        default: 5,
        min: 0,
        max: 5,
        step: 1,
        help: "Set to 0 to hide the star rating.",
      },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const align = alignOf(props);
    const m = props.avatar ? ctx.media[props.avatar as string] : undefined;
    const rating = Math.max(0, Math.min(5, Math.round(Number(props.rating ?? 0))));
    return (
      <Section props={props} tokens={t}>
        <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: "16px", alignItems: itemsFor(align) }}>
          {rating > 0 ? (
            <div style={{ color: t.colorAccent, fontSize: "16px", letterSpacing: "2px" }} aria-label={`${rating} out of 5`}>
              {"★".repeat(rating)}
              <span style={{ opacity: 0.25 }}>{"★".repeat(5 - rating)}</span>
            </div>
          ) : null}
          <blockquote
            data-cms-prop="quote"
            style={{
              margin: 0,
              fontFamily: t.fontHeading,
              fontSize: "clamp(18px, 2.2vw, 24px)",
              lineHeight: 1.4,
              fontWeight: 500,
              letterSpacing: "-0.01em",
              maxWidth: "46ch",
              textAlign: align,
            }}
          >
            {String(props.quote ?? "")}
          </blockquote>
          <figcaption style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {m && !m.missing ? (
              <img
                src={m.url}
                alt={m.alt}
                style={{ width: "44px", height: "44px", borderRadius: "999px", objectFit: "cover", flexShrink: 0 }}
              />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
              <span data-cms-prop="author" style={{ fontFamily: t.fontBody, fontSize: "15px", fontWeight: 650 }}>
                {String(props.author ?? "")}
              </span>
              {props.role ? (
                <span data-cms-prop="role" style={{ fontFamily: t.fontBody, fontSize: "13.5px", color: t.colorMuted }}>
                  {String(props.role)}
                </span>
              ) : null}
            </div>
          </figcaption>
        </figure>
      </Section>
    );
  },
};

// ─────────────────────────────────────────────────────────────────── Stat ────

const Stat: RegistryEntry = {
  schema: {
    name: "Stat",
    label: "Stat",
    description: "One big number that makes a point.",
    category: "marketing",
    icon: "＃",
    props: withStyleProps({
      value: { label: "Number", kind: "text", default: "10k+", inlineEditable: true },
      label: { label: "Label", kind: "text", default: "Active users", inlineEditable: true },
      description: {
        label: "Extra detail",
        kind: "textarea",
        default: "",
        inlineEditable: true,
        help: "An optional sentence under the number.",
      },
      valueSize: { label: "Number size", kind: "range", default: 52, min: 28, max: 96, step: 2, unit: "px" },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const align = alignOf(props);
    return (
      <Section props={props} tokens={t}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: itemsFor(align), textAlign: align }}>
          <div
            data-cms-prop="value"
            style={{
              fontFamily: t.fontHeading,
              fontSize: `clamp(32px, 6vw, ${Number(props.valueSize ?? 52)}px)`,
              fontWeight: 720,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              color: t.colorAccent,
            }}
          >
            {String(props.value ?? "")}
          </div>
          <div data-cms-prop="label" style={{ fontFamily: t.fontBody, fontSize: "15px", fontWeight: 600 }}>
            {String(props.label ?? "")}
          </div>
          {props.description ? (
            <p
              data-cms-prop="description"
              style={{ fontFamily: t.fontBody, fontSize: "13.5px", color: t.colorMuted, margin: "4px 0 0", maxWidth: "38ch", lineHeight: 1.5 }}
            >
              {String(props.description)}
            </p>
          ) : null}
        </div>
      </Section>
    );
  },
};

// ─────────────────────────────────────────────────────────────── LogoStrip ───

const LogoStrip: RegistryEntry = {
  schema: {
    name: "LogoStrip",
    label: "Logo strip",
    description: "A row of customer or partner logos.",
    category: "marketing",
    icon: "▚",
    props: withStyleProps({
      heading: {
        label: "Heading",
        kind: "text",
        default: "Trusted by teams everywhere",
        inlineEditable: true,
        help: "Leave empty to show just the logos.",
      },
      logos: {
        label: "Logos",
        kind: "refList",
        ref: "media",
        default: [],
        help: "Pick the logo images to show, in order.",
      },
      logoHeight: { label: "Logo height", kind: "range", default: 32, min: 16, max: 80, step: 2, unit: "px" },
      grayscale: { label: "Mute the colours", kind: "boolean", default: true },
      logoGap: { label: "Space between", kind: "range", default: 44, min: 12, max: 96, step: 4, unit: "px" },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const ids = Array.isArray(props.logos) ? (props.logos as string[]) : [];
    const logos = ids
      .map((id) => ctx.media[id])
      .filter((m): m is ResolvedMedia => Boolean(m) && !m.missing);
    const grayscale = Boolean(props.grayscale);
    return (
      <Section props={props} tokens={t}>
        {props.heading ? (
          <p
            data-cms-prop="heading"
            style={{
              fontFamily: t.fontBody,
              fontSize: "13px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: t.colorMuted,
              textAlign: "center",
              margin: "0 0 26px",
            }}
          >
            {String(props.heading)}
          </p>
        ) : null}
        {logos.length === 0 ? (
          <MissingRef t={t} label="Pick your logos in the panel on the right." />
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: `${Number(props.logoGap ?? 44)}px`,
            }}
          >
            {logos.map((m) => (
              <img
                key={m.id}
                src={m.url}
                alt={m.alt}
                style={{
                  height: `${Number(props.logoHeight ?? 32)}px`,
                  width: "auto",
                  objectFit: "contain",
                  filter: grayscale ? "grayscale(1)" : undefined,
                  opacity: grayscale ? 0.72 : 1,
                }}
              />
            ))}
          </div>
        )}
      </Section>
    );
  },
};

export const MARKETING_BLOCKS: RegistryEntry[] = [CtaBand, Testimonial, Stat, LogoStrip];
