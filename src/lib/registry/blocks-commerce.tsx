/**
 * COMMERCE-ADJACENT BLOCKS.
 *
 * FeaturedProduct spotlights one product with a working add-to-cart, and needs
 * the commerce module — it resolves a real product and reuses the AddToCart
 * island (D8: one component, hydrated on the hosted runtime and bound by the
 * bundled vanilla script in an export).
 *
 * PricingTier is deliberately NOT commerce-gated. A pricing plan is a link and a
 * list of features — no cart, no product — and gating it behind "you turned on a
 * store" would wrongly hide it from a service or SaaS site. So it lives in the
 * marketing category and is always available. It sits in this file because it is
 * the pricing half of the set the palette expansion asked for.
 */
import React from "react";
import { AddToCart } from "../../components/site/AddToCart";
import { MissingRef, Section, buttonStyle, money, resolveHref, withStyleProps } from "./style";
import type { RegistryEntry, RenderProps } from "./types";

// ──────────────────────────────────────────────────────── FeaturedProduct ────

const FeaturedProduct: RegistryEntry = {
  schema: {
    name: "FeaturedProduct",
    label: "Featured product",
    description: "One product, shown large, with add-to-cart.",
    category: "commerce",
    requiresModule: "commerce",
    icon: "★",
    props: withStyleProps({
      product: {
        label: "Product",
        kind: "ref",
        ref: "product",
        default: "",
        help: "The single product to spotlight.",
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
      showPrice: { label: "Show price", kind: "boolean", default: true },
      ctaLabel: { label: "Button label", kind: "text", default: "Add to cart" },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const p = props.product ? ctx.products[props.product as string] : undefined;

    let body: React.ReactNode;
    if (!p) {
      body = <MissingRef t={t} label="Choose a product in the panel on the right." />;
    } else if (p.missing) {
      body = <MissingRef t={t} label="This product was removed after this version was published." />;
    } else {
      const imageRight = props.mediaSide === "right";
      const imageEl = (
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          {p.imageUrl ? (
            <img src={p.imageUrl} alt={p.title} style={{ width: "100%", height: "auto", display: "block", borderRadius: t.radius }} />
          ) : (
            <div style={{ aspectRatio: "4 / 3", borderRadius: t.radius, background: `linear-gradient(135deg, ${t.colorBorder}, ${t.colorSurface})` }} />
          )}
        </div>
      );
      const infoEl = (
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: "14px", justifyContent: "center" }}>
          {props.eyebrow ? (
            <div
              data-cms-prop="eyebrow"
              style={{ fontFamily: t.fontBody, fontSize: "12.5px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: t.colorAccent }}
            >
              {String(props.eyebrow)}
            </div>
          ) : null}
          <h2 style={{ fontFamily: t.fontHeading, fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 660, letterSpacing: "-0.02em", lineHeight: 1.15, margin: 0 }}>
            {p.title}
          </h2>
          {props.showPrice ? (
            <div style={{ fontFamily: t.fontBody, fontSize: "20px", color: t.colorMuted }}>{money(p.priceCents)}</div>
          ) : null}
          {p.description ? (
            <p style={{ fontFamily: t.fontBody, fontSize: "15px", lineHeight: 1.6, margin: 0, opacity: 0.82, maxWidth: "52ch" }}>{p.description}</p>
          ) : null}
          <div style={{ marginTop: "2px" }}>
            <AddToCart
              siteId={ctx.siteId}
              variantId={p.variantId ?? ""}
              title={p.title}
              priceCents={p.priceCents}
              label={p.missing ? "Unavailable" : String(props.ctaLabel ?? "Add to cart")}
              disabled={p.missing || !p.variantId}
              preview={ctx.editing}
              style={{
                background: t.colorAccent,
                color: t.colorAccentFg,
                border: "none",
                padding: "13px 26px",
                borderRadius: t.radius,
                fontFamily: t.fontBody,
                fontWeight: 600,
                fontSize: "15px",
                cursor: "pointer",
              }}
            />
          </div>
        </div>
      );
      body = (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "44px", alignItems: "center" }}>
          {imageRight ? (
            <>
              {infoEl}
              {imageEl}
            </>
          ) : (
            <>
              {imageEl}
              {infoEl}
            </>
          )}
        </div>
      );
    }

    return (
      <Section props={props} tokens={t}>
        {body}
      </Section>
    );
  },
};

// ─────────────────────────────────────────────────────────────── PricingTier ─

const PricingTier: RegistryEntry = {
  schema: {
    name: "PricingTier",
    label: "Pricing plan",
    description: "One plan in a pricing table. Drop a few into Columns.",
    category: "marketing",
    icon: "▧",
    props: withStyleProps({
      name: { label: "Plan name", kind: "text", default: "Starter", inlineEditable: true },
      price: { label: "Price", kind: "text", default: "$9", inlineEditable: true },
      period: { label: "Per", kind: "text", default: "/month" },
      features: {
        label: "Features",
        kind: "textarea",
        default: "Unlimited pages\nCustom domain\nEmail support",
        inlineEditable: true,
        help: "One feature per line.",
      },
      ctaLabel: { label: "Button label", kind: "text", default: "Choose plan" },
      ctaHref: { label: "Button link", kind: "url", default: "#" },
      highlighted: {
        label: "Highlight this plan",
        kind: "boolean",
        default: false,
        help: "Give it an accent border to draw the eye.",
      },
      badge: { label: "Badge", kind: "text", default: "", help: "e.g. “Most popular”. Leave empty for none." },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const highlighted = Boolean(props.highlighted);
    const features = String(props.features ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return (
      <Section props={props} tokens={t}>
        <div
          style={{
            border: `${highlighted ? 2 : 1}px solid ${highlighted ? t.colorAccent : t.colorBorder}`,
            borderRadius: t.radius,
            background: t.colorSurface,
            padding: "26px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            height: "100%",
            textAlign: "left",
          }}
        >
          {props.badge ? (
            <span
              style={{
                alignSelf: "flex-start",
                background: t.colorAccent,
                color: t.colorAccentFg,
                fontFamily: t.fontBody,
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                padding: "3px 10px",
                borderRadius: "999px",
              }}
            >
              {String(props.badge)}
            </span>
          ) : null}
          <div>
            <div data-cms-prop="name" style={{ fontFamily: t.fontHeading, fontSize: "18px", fontWeight: 640 }}>
              {String(props.name ?? "")}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginTop: "8px" }}>
              <span data-cms-prop="price" style={{ fontFamily: t.fontHeading, fontSize: "34px", fontWeight: 720, letterSpacing: "-0.02em" }}>
                {String(props.price ?? "")}
              </span>
              {props.period ? (
                <span style={{ fontFamily: t.fontBody, fontSize: "14px", color: t.colorMuted }}>{String(props.period)}</span>
              ) : null}
            </div>
          </div>
          {features.length ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "9px", flex: 1 }}>
              {features.map((f, i) => (
                <li key={i} style={{ display: "flex", gap: "9px", fontFamily: t.fontBody, fontSize: "14px", lineHeight: 1.45 }}>
                  <span aria-hidden style={{ color: t.colorAccent, fontWeight: 700 }}>✓</span>
                  <span style={{ opacity: 0.85 }}>{f}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ flex: 1 }} />
          )}
          {props.ctaLabel ? (
            <a
              href={resolveHref(ctx.basePath, String(props.ctaHref || "#"))}
              style={{ ...buttonStyle(t, highlighted ? "solid" : "outline", "md"), display: "block", textAlign: "center" }}
            >
              {String(props.ctaLabel)}
            </a>
          ) : null}
        </div>
      </Section>
    );
  },
};

export const COMMERCE_BLOCKS: RegistryEntry[] = [FeaturedProduct, PricingTier];
