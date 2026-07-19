/**
 * The six components. Deliberately small — the point is the architecture, not
 * a component library.
 *
 * Two hard rules, both enforced by tests:
 *  1. Pure. No hooks, no client state. These run under renderToStaticMarkup in
 *     the build worker and inside the React editor canvas, and must produce
 *     identical output in both.
 *  2. Inline styles only, driven by theme tokens. A built artifact must render
 *     correctly with zero external CSS — unzip it, open index.html from file://,
 *     and it looks right. That is what "runs on any static host" has to mean.
 *
 * Interactivity is added by the injected runtime script, which binds to the
 * data-cms-* attributes emitted here. Static page, live cart. (D8)
 */
import React from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  RegistryEntry,
  RenderProps,
  ResolvedProduct,
  ThemeTokens,
} from "./types";

const PAD = { none: "0", sm: "32px", md: "64px", lg: "104px", xl: "152px" } as const;

function shell(t: ThemeTokens, extra: CSSProperties = {}): CSSProperties {
  return { maxWidth: t.maxWidth, marginLeft: "auto", marginRight: "auto", padding: "0 24px", ...extra };
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Shown wherever live data referenced by a frozen page has since been deleted. */
function MissingRef({ t, label }: { t: ThemeTokens; label: string }): ReactNode {
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
      }}
    >
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── Hero ───────

const Hero: RegistryEntry = {
  schema: {
    name: "Hero",
    label: "Hero",
    description: "Full-width banner with a headline and a call to action.",
    category: "content",
    icon: "▰",
    props: {
      headline: { label: "Headline", kind: "text", default: "Build once. Run anywhere." },
      subhead: {
        label: "Subheadline",
        kind: "textarea",
        default: "A page is a description, not a document.",
      },
      align: {
        label: "Alignment",
        kind: "select",
        default: "center",
        options: [
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
        ],
      },
      padding: {
        label: "Vertical space",
        kind: "select",
        default: "lg",
        options: Object.keys(PAD).map((k) => ({ value: k, label: k.toUpperCase() })),
      },
      background: {
        label: "Background image",
        kind: "ref",
        ref: "media",
        default: "",
        help: "Referencing media records a release dependency.",
      },
      ctaLabel: { label: "Button label", kind: "text", default: "Shop the collection" },
      ctaHref: { label: "Button link", kind: "url", default: "/products" },
    },
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const bg = props.background ? ctx.media[props.background as string] : undefined;
    const center = props.align !== "left";
    const pad = PAD[(props.padding as keyof typeof PAD) ?? "lg"] ?? PAD.lg;

    return (
      <section
        style={{
          background: bg && !bg.missing ? `linear-gradient(rgba(9,9,11,.62),rgba(9,9,11,.62)), url(${bg.url}) center/cover` : t.colorSurface,
          color: bg && !bg.missing ? "#fff" : t.colorFg,
          paddingTop: pad,
          paddingBottom: pad,
          borderBottom: `1px solid ${t.colorBorder}`,
        }}
      >
        <div style={shell(t, { textAlign: center ? "center" : "left" })}>
          <h1
            style={{
              fontFamily: t.fontHeading,
              fontSize: "clamp(36px, 6vw, 68px)",
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
              margin: 0,
              fontWeight: 680,
            }}
          >
            {String(props.headline ?? "")}
          </h1>
          {props.subhead ? (
            <p
              style={{
                fontFamily: t.fontBody,
                fontSize: "clamp(16px, 1.6vw, 20px)",
                lineHeight: 1.55,
                margin: "20px auto 0",
                maxWidth: "62ch",
                marginLeft: center ? "auto" : 0,
                opacity: 0.78,
              }}
            >
              {String(props.subhead)}
            </p>
          ) : null}
          {props.ctaLabel ? (
            <div style={{ marginTop: "34px" }}>
              <a
                href={String(props.ctaHref || "#")}
                style={{
                  display: "inline-block",
                  background: t.colorAccent,
                  color: t.colorAccentFg,
                  padding: "14px 30px",
                  borderRadius: t.radius,
                  fontFamily: t.fontBody,
                  fontWeight: 600,
                  fontSize: "15px",
                  textDecoration: "none",
                }}
              >
                {String(props.ctaLabel)}
              </a>
            </div>
          ) : null}
        </div>
      </section>
    );
  },
};

// ────────────────────────────────────────────────────────── TextBlock ───────

const TextBlock: RegistryEntry = {
  schema: {
    name: "TextBlock",
    label: "Text",
    description: "A paragraph of prose with an optional heading.",
    category: "content",
    icon: "¶",
    props: {
      heading: { label: "Heading", kind: "text", default: "" },
      body: {
        label: "Body",
        kind: "textarea",
        default:
          "Because the database stores a description rather than markup, the same saved page can be compiled to static HTML, to a container, or to a zip you host yourself.",
      },
      align: {
        label: "Alignment",
        kind: "select",
        default: "left",
        options: [
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
        ],
      },
      size: {
        label: "Text size",
        kind: "select",
        default: "md",
        options: [
          { value: "sm", label: "Small" },
          { value: "md", label: "Medium" },
          { value: "lg", label: "Large" },
        ],
      },
    },
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const sizes = { sm: "15px", md: "17px", lg: "21px" } as const;
    const center = props.align === "center";
    return (
      <section style={{ padding: "56px 0", background: t.colorBg, color: t.colorFg }}>
        <div style={shell(t, { textAlign: center ? "center" : "left" })}>
          {props.heading ? (
            <h2
              style={{
                fontFamily: t.fontHeading,
                fontSize: "clamp(24px,3vw,34px)",
                letterSpacing: "-0.02em",
                margin: "0 0 16px",
                fontWeight: 640,
              }}
            >
              {String(props.heading)}
            </h2>
          ) : null}
          <div
            style={{
              fontFamily: t.fontBody,
              fontSize: sizes[(props.size as keyof typeof sizes) ?? "md"] ?? sizes.md,
              lineHeight: 1.7,
              maxWidth: "72ch",
              marginLeft: center ? "auto" : 0,
              marginRight: center ? "auto" : 0,
              opacity: 0.85,
              whiteSpace: "pre-wrap",
            }}
          >
            {String(props.body ?? "")}
          </div>
        </div>
      </section>
    );
  },
};

// ────────────────────────────────────────────────────────────── Button ──────

const Button: RegistryEntry = {
  schema: {
    name: "Button",
    label: "Button",
    description: "A standalone link styled as a button.",
    category: "content",
    icon: "▭",
    props: {
      label: { label: "Label", kind: "text", default: "Learn more" },
      href: { label: "Link", kind: "url", default: "/about" },
      variant: {
        label: "Style",
        kind: "select",
        default: "solid",
        options: [
          { value: "solid", label: "Solid" },
          { value: "outline", label: "Outline" },
        ],
      },
      align: {
        label: "Alignment",
        kind: "select",
        default: "left",
        options: [
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" },
        ],
      },
    },
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const outline = props.variant === "outline";
    const justify =
      props.align === "center" ? "center" : props.align === "right" ? "flex-end" : "flex-start";
    return (
      <section style={{ padding: "16px 0", background: t.colorBg }}>
        <div style={shell(t, { display: "flex", justifyContent: justify })}>
          <a
            href={String(props.href || "#")}
            style={{
              display: "inline-block",
              background: outline ? "transparent" : t.colorAccent,
              color: outline ? t.colorFg : t.colorAccentFg,
              border: outline ? `1px solid ${t.colorBorder}` : "1px solid transparent",
              padding: "12px 26px",
              borderRadius: t.radius,
              fontFamily: t.fontBody,
              fontWeight: 600,
              fontSize: "15px",
              textDecoration: "none",
            }}
          >
            {String(props.label ?? "")}
          </a>
        </div>
      </section>
    );
  },
};

// ─────────────────────────────────────────────────────────── ImageBlock ─────

const ImageBlock: RegistryEntry = {
  schema: {
    name: "ImageBlock",
    label: "Image",
    description: "A single image from the media library.",
    category: "content",
    icon: "◫",
    props: {
      media: {
        label: "Image",
        kind: "ref",
        ref: "media",
        default: "",
        help: "Recorded in release_dependencies at publish time.",
      },
      caption: { label: "Caption", kind: "text", default: "" },
      width: {
        label: "Width",
        kind: "select",
        default: "wide",
        options: [
          { value: "narrow", label: "Narrow" },
          { value: "wide", label: "Wide" },
          { value: "full", label: "Full bleed" },
        ],
      },
      rounded: { label: "Rounded corners", kind: "boolean", default: true },
    },
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const m = props.media ? ctx.media[props.media as string] : undefined;
    const full = props.width === "full";
    const maxW = props.width === "narrow" ? "720px" : t.maxWidth;

    const inner = !m ? (
      <MissingRef t={t} label="No image selected." />
    ) : m.missing ? (
      <MissingRef t={t} label="This image was deleted after this version was published." />
    ) : (
      <figure style={{ margin: 0 }}>
        <img
          src={m.url}
          alt={m.alt}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            borderRadius: props.rounded && !full ? t.radius : 0,
          }}
        />
        {props.caption ? (
          <figcaption
            style={{
              fontFamily: t.fontBody,
              fontSize: "13px",
              color: t.colorMuted,
              marginTop: "10px",
              textAlign: "center",
            }}
          >
            {String(props.caption)}
          </figcaption>
        ) : null}
      </figure>
    );

    return (
      <section style={{ padding: "32px 0", background: t.colorBg }}>
        {full ? inner : <div style={shell(t, { maxWidth: maxW })}>{inner}</div>}
      </section>
    );
  },
};

// ────────────────────────────────────────────────────────── ProductGrid ─────

const ProductGrid: RegistryEntry = {
  schema: {
    name: "ProductGrid",
    label: "Product grid",
    description: "Products from a collection, with working add-to-cart.",
    category: "commerce",
    // Palette filtering: this never appears for a site without the commerce
    // module. Engine + blog is WordPress; engine + commerce is Shopify. (D6)
    requiresModule: "commerce",
    icon: "▦",
    props: {
      heading: { label: "Heading", kind: "text", default: "Featured" },
      collection: {
        label: "Collection",
        kind: "ref",
        ref: "collection",
        default: "",
        help: "The collection AND every product in it become release dependencies.",
      },
      columns: {
        label: "Columns",
        kind: "select",
        default: "3",
        options: [
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
        ],
      },
      showPrice: { label: "Show price", kind: "boolean", default: true },
      ctaLabel: { label: "Button label", kind: "text", default: "Add to cart" },
    },
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const col = props.collection ? ctx.collections[props.collection as string] : undefined;

    let body: ReactNode;
    if (!col) {
      body = <MissingRef t={t} label="No collection selected." />;
    } else if (col.missing) {
      // Graceful degradation, not a 500. The frozen page outlived the data. (D5)
      body = (
        <MissingRef
          t={t}
          label="This collection was removed after this version was published."
        />
      );
    } else {
      const products = col.productIds
        .map((id) => ctx.products[id])
        .filter(Boolean) as ResolvedProduct[];
      body = (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${props.columns ?? 3}, minmax(0,1fr))`,
            gap: "22px",
          }}
        >
          {products.map((p) => (
            <article
              key={p.id}
              data-cms-product={p.id}
              style={{
                border: `1px solid ${t.colorBorder}`,
                borderRadius: t.radius,
                overflow: "hidden",
                background: t.colorSurface,
                display: "flex",
                flexDirection: "column",
                opacity: p.missing ? 0.5 : 1,
              }}
            >
              <div
                style={{
                  aspectRatio: "4 / 3",
                  background: p.imageUrl
                    ? `url(${p.imageUrl}) center/cover`
                    : `linear-gradient(135deg, ${t.colorBorder}, ${t.colorSurface})`,
                }}
              />
              <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                <h3
                  style={{
                    fontFamily: t.fontHeading,
                    fontSize: "16px",
                    margin: 0,
                    fontWeight: 620,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {p.title}
                </h3>
                {props.showPrice ? (
                  <div style={{ fontFamily: t.fontBody, fontSize: "15px", color: t.colorMuted }}>
                    {money(p.priceCents)}
                  </div>
                ) : null}
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  // The runtime script binds to this. The HTML file never changes;
                  // clicking it writes a row to `orders`. That is the D8 line.
                  data-cms-add-to-cart={p.variantId ?? ""}
                  data-cms-title={p.title}
                  data-cms-price={String(p.priceCents)}
                  disabled={p.missing || !p.variantId}
                  style={{
                    marginTop: "10px",
                    background: t.colorAccent,
                    color: t.colorAccentFg,
                    border: "none",
                    padding: "11px 16px",
                    borderRadius: t.radius,
                    fontFamily: t.fontBody,
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  {p.missing ? "Unavailable" : String(props.ctaLabel ?? "Add to cart")}
                </button>
              </div>
            </article>
          ))}
        </div>
      );
    }

    return (
      <section style={{ padding: "56px 0", background: t.colorBg, color: t.colorFg }}>
        <div style={shell(t)}>
          {props.heading ? (
            <h2
              style={{
                fontFamily: t.fontHeading,
                fontSize: "clamp(22px,2.6vw,30px)",
                letterSpacing: "-0.02em",
                margin: "0 0 24px",
                fontWeight: 640,
              }}
            >
              {String(props.heading)}
            </h2>
          ) : null}
          {body}
        </div>
      </section>
    );
  },
};

// ────────────────────────────────────────────────────────────── Spacer ──────

const Spacer: RegistryEntry = {
  schema: {
    name: "Spacer",
    label: "Spacer",
    description: "Vertical breathing room.",
    category: "layout",
    icon: "↕",
    props: {
      height: { label: "Height (px)", kind: "number", default: 64 },
    },
  },
  render({ props }: RenderProps) {
    return <div style={{ height: `${Number(props.height ?? 64)}px` }} />;
  },
};

export const COMPONENTS: RegistryEntry[] = [
  Hero,
  TextBlock,
  ProductGrid,
  ImageBlock,
  Button,
  Spacer,
];
