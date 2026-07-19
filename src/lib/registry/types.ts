/**
 * The contract between a stored description and real code.
 *
 * The database stores {type: "Hero", props: {...}}. Nothing more. This file
 * defines what a component must declare so that a name string can become
 * (a) a rendered element, (b) a properties panel, and (c) a dependency edge.
 */
import type { ReactNode } from "react";

export type ModuleName = "blog" | "commerce" | "forms";
export type RefKind = "product" | "collection" | "post" | "media";

/**
 * How a prop is edited AND — for `ref`/`refList` — what it points at.
 *
 * This single declaration drives three separate systems:
 *   1. the properties panel widget in the editor
 *   2. release_dependencies extraction at publish time
 *   3. the "3 live releases use this" warning before a delete
 *
 * Inferring references instead (regex over JSONB, naming conventions) would be
 * the one dishonest seam in an otherwise verifiable system.
 */
export type PropKind =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "color"
  | "url"
  | "select"
  | "ref"
  | "refList";

export interface PropDef {
  label: string;
  kind: PropKind;
  default: unknown;
  help?: string;
  options?: { value: string; label: string }[];
  /** Required when kind is "ref" or "refList". The live entity this prop points at. */
  ref?: RefKind;
  /** Only shown in the panel when this predicate passes over sibling prop values. */
  showIf?: (props: Record<string, unknown>) => boolean;
}

export interface ComponentSchema {
  name: string;
  label: string;
  description: string;
  category: "layout" | "content" | "commerce";
  /** Palette filtering. Absent = engine component, always available. */
  requiresModule?: ModuleName;
  acceptsChildren?: boolean;
  /** Single-glyph icon for the palette; keeps the editor dependency-free. */
  icon: string;
  props: Record<string, PropDef>;
}

/** A node in the stored description. This is the entire page format. */
export interface PageNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: PageNode[];
}

export interface PageBody {
  /** Format version — lets old revisions stay readable after the format moves on. */
  version: 1;
  root: PageNode[];
}

/** Design tokens from theme_revisions.tokens — emitted as CSS custom properties. */
export interface ThemeTokens {
  colorBg: string;
  colorFg: string;
  colorMuted: string;
  colorAccent: string;
  colorAccentFg: string;
  colorSurface: string;
  colorBorder: string;
  fontHeading: string;
  fontBody: string;
  radius: string;
  maxWidth: string;
}

export interface NavLink {
  label: string;
  href: string;
}

/**
 * Site chrome wrapping every page. Stored in theme_revisions.layout, so it is
 * versioned and rolls back along with the pages — change the brand name, publish,
 * roll back, and the old brand returns. Kept as structured data rather than
 * components so the palette stays at exactly the six specified blocks.
 */
export interface ThemeLayout {
  nav: { brand: string; links: NavLink[] };
  footer: { text: string; links: NavLink[] };
}

/**
 * Live (Tier-2) data resolved at BUILD time and frozen into the artifact.
 *
 * This is where D5's accepted cost lives: the snapshot of product titles baked
 * into an artifact can drift from the database. That's the trade for a page
 * that renders with no server. The dependency index makes the drift visible.
 */
export interface RenderContext {
  siteId: string;
  siteName: string;
  releaseId: string;
  /** Absolute origin the artifact's JS calls for cart/orders. Baked in at build. */
  runtimeApi: string;
  tokens: ThemeTokens;
  products: Record<string, ResolvedProduct>;
  collections: Record<string, ResolvedCollection>;
  media: Record<string, ResolvedMedia>;
  /** True when rendering the editor canvas — lets components show placeholders. */
  editing?: boolean;
}

export interface ResolvedProduct {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  priceCents: number;
  variantId: string | null;
  /** Soft-deleted at build time → component degrades gracefully instead of vanishing. */
  missing?: boolean;
}

export interface ResolvedCollection {
  id: string;
  title: string;
  handle: string;
  productIds: string[];
  missing?: boolean;
}

export interface ResolvedMedia {
  id: string;
  url: string;
  alt: string;
  missing?: boolean;
}

export interface RenderProps {
  node: PageNode;
  props: Record<string, any>;
  ctx: RenderContext;
  children?: ReactNode;
}

export interface RegistryEntry {
  schema: ComponentSchema;
  /**
   * Pure render function. No hooks, no client state — it must run under
   * renderToStaticMarkup inside the build worker AND inside the editor canvas.
   * Interactivity comes from the injected runtime script binding to data-cms-*.
   */
  render: (p: RenderProps) => ReactNode;
}
