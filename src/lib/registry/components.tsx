/**
 * The component library.
 *
 * Two hard rules, both enforced by tests:
 *  1. Pure. No hooks, no client state. These run under renderToStaticMarkup in
 *     the build worker and inside the React editor canvas, and must produce
 *     identical output in both.
 *  2. Inline styles only, driven by theme tokens. A built artifact must render
 *     correctly with zero external CSS — unzip it, open index.html from file://,
 *     and it looks right. That is what "runs on any static host" has to mean.
 *
 * Each component below writes only its CONTENT. Background, text colour,
 * spacing, width, alignment, radius and borders come from the shared style
 * system (./style.tsx) and are therefore editable on every block.
 *
 * Interactivity is added by the injected runtime script, which binds to the
 * data-cms-* attributes emitted here. Static page, live cart. (D8)
 */
import React from "react";
import type { ReactNode } from "react";
// Relative, not "@/": this module is also loaded by the build worker and the
// test runner, which run outside Next's resolver.
import { AddToCart } from "../../components/site/AddToCart";
import { COMMERCE_BLOCKS } from "./blocks-commerce";
import { CONTENT_BLOCKS } from "./blocks-content";
import { FORM_BLOCKS } from "./blocks-forms";
import { MARKETING_BLOCKS } from "./blocks-marketing";
import { MEDIA_BLOCKS } from "./blocks-media";
import {
  MissingRef,
  Section,
  alignOf,
  autoGrid,
  buttonStyle,
  justifyFor,
  money,
  withStyleProps,
} from "./style";
import type { RegistryEntry, RenderProps, ResolvedProduct } from "./types";

// ─────────────────────────────────────────────────────────────── Hero ───────

const Hero: RegistryEntry = {
  schema: {
    name: "Hero",
    label: "Hero",
    description: "Big opening statement with a call to action.",
    category: "content",
    icon: "▰",
    props: withStyleProps({
      headline: {
        label: "Headline",
        kind: "text",
        default: "Build once. Run anywhere.",
        inlineEditable: true,
      },
      subhead: {
        label: "Subheadline",
        kind: "textarea",
        default: "A page is a description, not a document.",
        inlineEditable: true,
      },
      size: {
        label: "Headline size",
        kind: "range",
        default: 60,
        min: 28,
        max: 110,
        step: 2,
        unit: "px",
      },
      ctaLabel: { label: "Button label", kind: "text", default: "Shop the collection" },
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
        <h1
          data-cms-prop="headline"
          style={{
            fontFamily: t.fontHeading,
            fontSize: `clamp(32px, 6vw, ${Number(props.size ?? 60)}px)`,
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
            data-cms-prop="subhead"
            style={{
              fontFamily: t.fontBody,
              fontSize: "clamp(16px, 1.6vw, 20px)",
              lineHeight: 1.55,
              margin: "20px 0 0",
              maxWidth: "62ch",
              marginLeft: align === "center" ? "auto" : align === "right" ? "auto" : 0,
              marginRight: align === "center" ? "auto" : 0,
              opacity: 0.78,
            }}
          >
            {String(props.subhead)}
          </p>
        ) : null}
        {props.ctaLabel ? (
          <div style={{ marginTop: "34px", display: "flex", justifyContent: justifyFor(align) }}>
            <a href={String(props.ctaHref || "#")} style={buttonStyle(t, String(props.ctaVariant ?? "solid"), "lg")}>
              {String(props.ctaLabel)}
            </a>
          </div>
        ) : null}
      </Section>
    );
  },
};

// ──────────────────────────────────────────────────────────── Heading ───────

const Heading: RegistryEntry = {
  schema: {
    name: "Heading",
    label: "Heading",
    description: "A section title on its own.",
    category: "content",
    icon: "H",
    props: withStyleProps({
      text: { label: "Text", kind: "text", default: "A section heading", inlineEditable: true },
      level: {
        label: "Level",
        kind: "segment",
        default: "h2",
        options: [
          { value: "h2", label: "H2" },
          { value: "h3", label: "H3" },
          { value: "h4", label: "H4" },
        ],
      },
      size: { label: "Size", kind: "range", default: 34, min: 16, max: 80, step: 2, unit: "px" },
      weight: {
        label: "Weight",
        kind: "segment",
        default: "600",
        options: [
          { value: "400", label: "Regular" },
          { value: "600", label: "Semibold" },
          { value: "700", label: "Bold" },
        ],
      },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const Tag = (["h2", "h3", "h4"].includes(String(props.level)) ? props.level : "h2") as "h2";
    return (
      <Section props={props} tokens={t}>
        <Tag
          data-cms-prop="text"
          style={{
            fontFamily: t.fontHeading,
            fontSize: `clamp(20px, 4vw, ${Number(props.size ?? 34)}px)`,
            fontWeight: Number(props.weight ?? 600),
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {String(props.text ?? "")}
        </Tag>
      </Section>
    );
  },
};

// ────────────────────────────────────────────────────────── TextBlock ───────

const TextBlock: RegistryEntry = {
  schema: {
    name: "TextBlock",
    label: "Text",
    description: "A paragraph of prose, with an optional heading.",
    category: "content",
    icon: "¶",
    props: withStyleProps({
      heading: { label: "Heading", kind: "text", default: "", inlineEditable: true },
      body: {
        label: "Body",
        kind: "textarea",
        default:
          "Because the database stores a description rather than markup, the same saved page can be compiled to static HTML, to a container, or to a zip you host yourself.",
        inlineEditable: true,
      },
      size: { label: "Text size", kind: "range", default: 17, min: 12, max: 28, step: 1, unit: "px" },
      lineHeight: { label: "Line height", kind: "range", default: 170, min: 110, max: 220, step: 5, unit: "%" },
      measure: { label: "Line length", kind: "range", default: 72, min: 30, max: 110, step: 2, unit: "ch" },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const align = alignOf(props);
    const centred = align === "center";
    return (
      <Section props={props} tokens={t}>
        {props.heading ? (
          <h2
            data-cms-prop="heading"
            style={{
              fontFamily: t.fontHeading,
              fontSize: "clamp(22px,3vw,32px)",
              letterSpacing: "-0.02em",
              margin: "0 0 16px",
              fontWeight: 640,
            }}
          >
            {String(props.heading)}
          </h2>
        ) : null}
        <div
          data-cms-prop="body"
          style={{
            fontFamily: t.fontBody,
            fontSize: `${Number(props.size ?? 17)}px`,
            lineHeight: Number(props.lineHeight ?? 170) / 100,
            maxWidth: `${Number(props.measure ?? 72)}ch`,
            marginLeft: centred ? "auto" : align === "right" ? "auto" : 0,
            marginRight: centred ? "auto" : 0,
            opacity: 0.85,
            whiteSpace: "pre-wrap",
          }}
        >
          {String(props.body ?? "")}
        </div>
      </Section>
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
    props: withStyleProps({
      label: { label: "Label", kind: "text", default: "Learn more", inlineEditable: true },
      href: { label: "Link", kind: "url", default: "/about" },
      variant: {
        label: "Style",
        kind: "segment",
        default: "solid",
        options: [
          { value: "solid", label: "Solid" },
          { value: "outline", label: "Outline" },
          { value: "ghost", label: "Text" },
        ],
      },
      size: {
        label: "Size",
        kind: "segment",
        default: "md",
        options: [
          { value: "sm", label: "S" },
          { value: "md", label: "M" },
          { value: "lg", label: "L" },
        ],
      },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    return (
      <Section props={props} tokens={t}>
        <div style={{ display: "flex", justifyContent: justifyFor(alignOf(props)) }}>
          <a
            data-cms-prop="label"
            href={String(props.href || "#")}
            style={buttonStyle(t, String(props.variant ?? "solid"), String(props.size ?? "md"))}
          >
            {String(props.label ?? "")}
          </a>
        </div>
      </Section>
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
    props: withStyleProps({
      media: {
        label: "Image",
        kind: "ref",
        ref: "media",
        default: "",
        help: "Choose a picture from your media library.",
      },
      caption: { label: "Caption", kind: "text", default: "", inlineEditable: true },
      imageRadius: { label: "Image corners", kind: "range", default: 12, min: 0, max: 48, step: 2, unit: "px" },
      ratio: {
        label: "Shape",
        kind: "segment",
        default: "auto",
        options: [
          { value: "auto", label: "Auto" },
          { value: "16/9", label: "Wide" },
          { value: "4/3", label: "4:3" },
          { value: "1/1", label: "Square" },
        ],
      },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const m = props.media ? ctx.media[props.media as string] : undefined;

    const inner = !m ? (
      <MissingRef t={t} label="Pick an image in the panel on the right." />
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
            height: props.ratio !== "auto" ? "100%" : "auto",
            aspectRatio: props.ratio !== "auto" ? String(props.ratio) : undefined,
            objectFit: "cover",
            borderRadius: `${Number(props.imageRadius ?? 12)}px`,
          }}
        />
        {props.caption ? (
          <figcaption
            data-cms-prop="caption"
            style={{
              fontFamily: t.fontBody,
              fontSize: "13px",
              color: t.colorMuted,
              marginTop: "10px",
            }}
          >
            {String(props.caption)}
          </figcaption>
        ) : null}
      </figure>
    );

    return (
      <Section props={props} tokens={t}>
        {inner}
      </Section>
    );
  },
};

// ───────────────────────────────────────────────────────────── Columns ──────

const Columns: RegistryEntry = {
  schema: {
    name: "Columns",
    label: "Columns",
    description: "A row you can drop other blocks into.",
    category: "layout",
    icon: "▥",
    acceptsChildren: true,
    props: withStyleProps({
      columns: {
        label: "Columns",
        kind: "segment",
        default: "2",
        options: [
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
        ],
      },
      gap: { label: "Gap", kind: "range", default: 24, min: 0, max: 80, step: 4, unit: "px" },
      verticalAlign: {
        label: "Vertical align",
        kind: "segment",
        default: "stretch",
        options: [
          { value: "start", label: "Top" },
          { value: "center", label: "Middle" },
          { value: "stretch", label: "Stretch" },
        ],
      },
    }),
  },
  render({ props, ctx, children }: RenderProps) {
    const t = ctx.tokens;
    return (
      <Section props={props} tokens={t}>
        <div
          data-cms-slot="children"
          style={{
            display: "grid",
            gridTemplateColumns: autoGrid(Number(props.columns ?? 2)),
            gap: `${Number(props.gap ?? 24)}px`,
            alignItems: String(props.verticalAlign ?? "stretch"),
          }}
        >
          {children}
        </div>
      </Section>
    );
  },
};

// ─────────────────────────────────────────────────────────────── Card ───────

const Card: RegistryEntry = {
  schema: {
    name: "Card",
    label: "Card",
    description: "Image, title, text and a link in a bordered box.",
    category: "content",
    icon: "▤",
    props: withStyleProps({
      media: { label: "Image", kind: "ref", ref: "media", default: "" },
      title: { label: "Title", kind: "text", default: "A card", inlineEditable: true },
      body: {
        label: "Text",
        kind: "textarea",
        default: "A short supporting sentence.",
        inlineEditable: true,
      },
      linkLabel: { label: "Link label", kind: "text", default: "Read more" },
      linkHref: { label: "Link", kind: "url", default: "#" },
      cardBg: { label: "Card background", kind: "color", default: "", group: "style" },
      bordered: { label: "Border", kind: "boolean", default: true, group: "style" },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const m = props.media ? ctx.media[props.media as string] : undefined;
    return (
      <Section props={props} tokens={t}>
        <div
          style={{
            border: props.bordered ? `1px solid ${t.colorBorder}` : "none",
            borderRadius: t.radius,
            background: props.cardBg || t.colorSurface,
            overflow: "hidden",
            textAlign: "left",
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {m && !m.missing ? (
            <div style={{ aspectRatio: "16 / 10", background: `url(${m.url}) center/cover` }} />
          ) : null}
          <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
            <h3
              data-cms-prop="title"
              style={{
                fontFamily: t.fontHeading,
                fontSize: "18px",
                margin: 0,
                fontWeight: 640,
                letterSpacing: "-0.01em",
              }}
            >
              {String(props.title ?? "")}
            </h3>
            <p
              data-cms-prop="body"
              style={{
                fontFamily: t.fontBody,
                fontSize: "14.5px",
                lineHeight: 1.6,
                margin: 0,
                opacity: 0.75,
              }}
            >
              {String(props.body ?? "")}
            </p>
            {props.linkLabel ? (
              <a
                href={String(props.linkHref || "#")}
                style={{
                  marginTop: "6px",
                  fontFamily: t.fontBody,
                  fontSize: "14px",
                  fontWeight: 600,
                  color: t.colorAccent,
                  textDecoration: "none",
                }}
              >
                {String(props.linkLabel)} →
              </a>
            ) : null}
          </div>
        </div>
      </Section>
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
    props: withStyleProps({
      heading: { label: "Heading", kind: "text", default: "Featured", inlineEditable: true },
      collection: {
        label: "Collection",
        kind: "ref",
        ref: "collection",
        default: "",
        help: "Pick which group of products to show. Everything in it appears here.",
      },
      columns: {
        label: "Columns",
        kind: "segment",
        default: "3",
        options: [
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
        ],
      },
      gap: { label: "Gap", kind: "range", default: 22, min: 8, max: 60, step: 2, unit: "px" },
      showPrice: { label: "Show price", kind: "boolean", default: true },
      cardBg: { label: "Card background", kind: "color", default: "", group: "style" },
      ctaLabel: { label: "Button label", kind: "text", default: "Add to cart" },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const col = props.collection ? ctx.collections[props.collection as string] : undefined;

    let body: ReactNode;
    if (!col) {
      body = <MissingRef t={t} label="Choose a collection in the panel on the right." />;
    } else if (col.missing) {
      // Graceful degradation, not a 500. The frozen page outlived the data. (D5)
      body = <MissingRef t={t} label="This collection was removed after this version was published." />;
    } else {
      const products = col.productIds.map((id) => ctx.products[id]).filter(Boolean) as ResolvedProduct[];
      body = (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: autoGrid(Number(props.columns ?? 3)),
            gap: `${Number(props.gap ?? 22)}px`,
            textAlign: "left",
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
                background: props.cardBg || t.colorSurface,
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
                <h3 style={{ fontFamily: t.fontHeading, fontSize: "16px", margin: 0, fontWeight: 620, letterSpacing: "-0.01em" }}>
                  {p.title}
                </h3>
                {props.showPrice ? (
                  <div style={{ fontFamily: t.fontBody, fontSize: "15px", color: t.colorMuted }}>
                    {money(p.priceCents)}
                  </div>
                ) : null}
                <div style={{ flex: 1 }} />
                {/*
                  A client component, rendered from a server component. On the
                  hosted runtime React hydrates it and the click is real; in the
                  exported artifact nothing hydrates and the bundled vanilla
                  script binds to the data-* attributes it emits. One component,
                  both paths — see components/site/AddToCart.tsx.
                */}
                <AddToCart
                  siteId={ctx.siteId}
                  variantId={p.variantId ?? ""}
                  title={p.title}
                  priceCents={p.priceCents}
                  label={p.missing ? "Unavailable" : String(props.ctaLabel ?? "Add to cart")}
                  disabled={p.missing || !p.variantId}
                  preview={ctx.editing}
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
                />
              </div>
            </article>
          ))}
        </div>
      );
    }

    return (
      <Section props={props} tokens={t}>
        {props.heading ? (
          <h2
            data-cms-prop="heading"
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
      </Section>
    );
  },
};

// ─────────────────────────────────────────────────────────────── PostList ───

/** Fixed, UTC-based date so the build and the runtime render the same bytes. */
function postDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const PostList: RegistryEntry = {
  schema: {
    name: "PostList",
    label: "Blog posts",
    description: "A list of posts you choose, with their dates and summaries.",
    category: "blog",
    // Only appears for a site with the blog module. Engine + blog is WordPress;
    // engine + commerce is Shopify; the difference is a row in site_modules. (D6)
    requiresModule: "blog",
    icon: "✎",
    props: withStyleProps({
      heading: { label: "Heading", kind: "text", default: "From the blog", inlineEditable: true },
      posts: {
        label: "Posts",
        kind: "refList",
        ref: "post",
        default: [],
        help: "Pick which posts to show, newest choice first.",
      },
      columns: {
        label: "Columns",
        kind: "segment",
        default: "2",
        options: [
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3" },
        ],
      },
      gap: { label: "Gap", kind: "range", default: 22, min: 8, max: 60, step: 2, unit: "px" },
      showDate: { label: "Show dates", kind: "boolean", default: true },
      showExcerpt: { label: "Show summaries", kind: "boolean", default: true },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const ids = Array.isArray(props.posts) ? (props.posts as string[]) : [];
    // Drop posts that were deleted or unpublished at build time — a blog list
    // that quietly skips a gone post reads better than one showing a placeholder.
    const posts = ids.map((id) => ctx.posts?.[id]).filter((p) => p && !p.missing);

    let body: ReactNode;
    if (ids.length === 0) {
      body = <MissingRef t={t} label="Choose posts to show in the panel on the right." />;
    } else if (posts.length === 0) {
      body = <MissingRef t={t} label="None of the chosen posts are published yet." />;
    } else {
      body = (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: autoGrid(Number(props.columns ?? 2)),
            gap: `${Number(props.gap ?? 22)}px`,
            textAlign: "left",
          }}
        >
          {posts.map((p) => (
            <article
              key={p!.id}
              data-cms-post={p!.id}
              style={{
                border: `1px solid ${t.colorBorder}`,
                borderRadius: t.radius,
                background: t.colorSurface,
                padding: "20px 22px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {props.showDate && p!.publishedAt ? (
                <div
                  style={{
                    fontFamily: t.fontBody,
                    fontSize: "12px",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: t.colorMuted,
                  }}
                >
                  {postDate(p!.publishedAt)}
                </div>
              ) : null}
              <h3
                style={{
                  fontFamily: t.fontHeading,
                  fontSize: "19px",
                  margin: 0,
                  fontWeight: 640,
                  letterSpacing: "-0.01em",
                }}
              >
                {p!.title}
              </h3>
              {props.showExcerpt && p!.excerpt ? (
                <p
                  style={{
                    fontFamily: t.fontBody,
                    fontSize: "14.5px",
                    lineHeight: 1.6,
                    margin: 0,
                    opacity: 0.78,
                  }}
                >
                  {p!.excerpt}
                </p>
              ) : null}
              <a
                href={`/blog/${p!.slug}`}
                style={{
                  marginTop: "2px",
                  fontFamily: t.fontBody,
                  fontSize: "14px",
                  fontWeight: 600,
                  color: t.colorAccent,
                  textDecoration: "none",
                }}
              >
                Read more →
              </a>
            </article>
          ))}
        </div>
      );
    }

    return (
      <Section props={props} tokens={t}>
        {props.heading ? (
          <h2
            data-cms-prop="heading"
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
      </Section>
    );
  },
};

// ───────────────────────────────────────────────────────────── Divider ──────

const Divider: RegistryEntry = {
  schema: {
    name: "Divider",
    label: "Divider",
    description: "A horizontal rule.",
    category: "layout",
    icon: "—",
    props: withStyleProps({
      thickness: { label: "Thickness", kind: "range", default: 1, min: 1, max: 8, step: 1, unit: "px" },
      lineColor: { label: "Line colour", kind: "color", default: "", group: "style" },
      width: { label: "Width", kind: "range", default: 100, min: 10, max: 100, step: 5, unit: "%" },
    }),
  },
  render({ props, ctx }: RenderProps) {
    const t = ctx.tokens;
    const align = alignOf(props);
    return (
      <Section props={props} tokens={t}>
        <hr
          style={{
            border: "none",
            height: `${Number(props.thickness ?? 1)}px`,
            background: props.lineColor || t.colorBorder,
            width: `${Number(props.width ?? 100)}%`,
            margin: align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : 0,
          }}
        />
      </Section>
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
    styleable: false,
    props: {
      height: { label: "Height", kind: "range", default: 64, min: 4, max: 320, step: 4, unit: "px" },
      showLine: { label: "Show line", kind: "boolean", default: false },
    },
  },
  render({ props, ctx }: RenderProps) {
    return (
      <div
        style={{
          height: `${Number(props.height ?? 64)}px`,
          borderTop: props.showLine ? `1px solid ${ctx.tokens.colorBorder}` : undefined,
          background: ctx.tokens.colorBg,
        }}
      />
    );
  },
};

export const COMPONENTS: RegistryEntry[] = [
  Hero,
  Heading,
  TextBlock,
  ImageBlock,
  Button,
  Card,
  Columns,
  ProductGrid,
  PostList,
  Divider,
  Spacer,
  // Category sets live in their own files (I16 — the palette is a real library
  // now). They are the same kind of entry as the ones above; only the file split
  // is new, so they append to the same array the registry already indexes.
  ...MARKETING_BLOCKS,
  ...CONTENT_BLOCKS,
  ...MEDIA_BLOCKS,
  ...COMMERCE_BLOCKS,
  ...FORM_BLOCKS,
];
