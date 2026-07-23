/**
 * The contract between a stored description and real code.
 *
 * The database stores {type: "Hero", props: {...}}. Nothing more. This file
 * defines what a component must declare so that a name string can become
 * (a) a rendered element, (b) a properties panel, and (c) a dependency edge.
 */
import type { ReactNode } from "react";

export type ModuleName = "blog" | "commerce" | "forms";
export type RefKind = "product" | "collection" | "post" | "media" | "component";

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
  | "range"
  | "boolean"
  | "color"
  | "url"
  | "select"
  | "segment"
  | "ref"
  | "refList";

/** Which panel section a prop appears under. */
export type PropGroup = "content" | "style" | "layout";

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
  /** Panel grouping. Defaults to "content". */
  group?: PropGroup;
  /** For kind: "range" / "number". */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Text props that can be edited directly on the canvas. */
  inlineEditable?: boolean;
}

export interface ComponentSchema {
  name: string;
  label: string;
  description: string;
  category: "layout" | "content" | "commerce";
  /** Palette filtering. Absent = engine component, always available. */
  requiresModule?: ModuleName;
  /** Container components accept dropped children (e.g. Columns). */
  acceptsChildren?: boolean;
  /** Fixed number of child slots, for grid-like containers. */
  slots?: number;
  /** Single-glyph icon for the palette; keeps the editor dependency-free. */
  icon: string;
  props: Record<string, PropDef>;
  /** Set false to opt out of the shared style controls (e.g. Spacer, Divider). */
  styleable?: boolean;
  /**
   * Kept out of the palette. Used by the shared-component reference, which is
   * a real registry entry (so extraction, rendering and the properties panel all
   * work unchanged) but is never dragged in generically — you insert a specific
   * symbol, and the palette lists those separately.
   */
  hidden?: boolean;
}

/** A node in the stored description. This is the entire page format. */
export interface PageNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: PageNode[];
  /**
   * Provenance, set ONLY by shared-component expansion at render time and never
   * stored. Its presence means "this node belongs to a symbol" — the editor uses
   * it to refuse in-place edits, and a test asserts it never reaches the database.
   *
   * The four fields answer two different questions, and with nested components
   * they have different answers:
   *   componentId / innerId  — the INNERMOST component that owns this node, and
   *                            its id in there. "Which component do I open?"
   *   instanceId / overrideKey — the OUTERMOST instance, the one that really
   *                            exists in the page's stored tree, and this node's
   *                            path inside it. "Where do I record an override?"
   */
  fromComponent?: {
    instanceId: string;
    componentId: string;
    innerId: string;
    overrideKey: string;
  };
}

export interface PageBody {
  /** Format version — lets old revisions stay readable after the format moves on. */
  version: 1;
  root: PageNode[];
}

/**
 * A shared component's stored body. Deliberately the same format as a page's:
 * a symbol is a tree of the same blocks, which is why the same editor, the same
 * registry and the same renderer all work on it without a special case.
 */
export type ComponentBody = PageBody;

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
  /**
   * Shared component trees, keyed by component id.
   *
   * Unlike products and collections, these are NOT live data: the build resolves
   * them from the revision the release pinned, so a released page renders the
   * header it was published with, not today's header. That is the difference
   * between Tier-1 and Tier-2 arriving in the same context object.
   */
  components: Record<string, ResolvedSharedComponent>;
  /** True when rendering the editor canvas — lets components show placeholders. */
  editing?: boolean;
}

/** A shared component's tree, resolved from the revision this release pinned. */
export interface ResolvedSharedComponent {
  id: string;
  name: string;
  root: PageNode[];
  /** Revision this came from — stamped into the markup so provenance is checkable. */
  revisionId?: string;
  /** Deleted, or never pinned by this release. Renders a visible placeholder. */
  missing?: boolean;
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
