/**
 * The headless Content API's serializer.
 *
 * Turns an immutable release into clean, self-describing JSON a developer can
 * consume in any frontend — the same content the site renders, minus our storage
 * mechanics. Two deliberate transforms make it pleasant:
 *
 *   1. @component references are UNWRAPPED. Our shared-component wrapper is an
 *      internal detail; a consumer wants the resolved blocks, in order, inline.
 *   2. Tier-2 records (products, posts, media…) travel as a normalized `data`
 *      dictionary keyed by id, exactly as the release froze them, so a block that
 *      points at a product by id can be joined without a second request.
 *
 * Everything here is a pure function of the (immutable) release, so a response is
 * as cacheable as the release id itself — same argument as runtime/release.ts.
 */
import { expandComponents } from "./shared-components";
import type { LoadedRelease } from "./runtime/release";
import type { PageNode } from "./registry/types";

export interface ApiBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children?: ApiBlock[];
}

export interface ApiPage {
  path: string;
  title: string;
  blocks: ApiBlock[];
}

export interface SiteContent {
  site: { name: string; slug: string; version: number; publishedAt: string };
  theme: {
    colors: Record<string, string>;
    fonts: { heading: string; body: string };
    radius: string;
    maxWidth: string;
  };
  nav: LoadedRelease["layout"]["nav"];
  footer: LoadedRelease["layout"]["footer"];
  pages: ApiPage[];
  /** Resolved Tier-2 records this release references, keyed by id. */
  data: unknown;
}

const DATA_URI = /^data:([^;,]*)[^,]*,(.*)$/s;

/**
 * Keep the payload readable by default: a data-URI image is replaced with a
 * short descriptor unless the caller opts into the bytes with `?embed=1`. This is
 * what makes a `curl` of a real site print cleanly instead of a screen of base64,
 * while a real integration can still pull the actual images.
 */
function clean(value: unknown, embed: boolean): unknown {
  if (typeof value === "string") {
    if (!embed && value.length > 256) {
      const m = DATA_URI.exec(value);
      if (m) return `data:${m[1] || "application/octet-stream"};… (${value.length} bytes — use ?embed=1)`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => clean(v, embed));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = clean(v, embed);
    return out;
  }
  return value;
}

function serializeNodes(nodes: PageNode[], embed: boolean): ApiBlock[] {
  const out: ApiBlock[] = [];
  for (const node of nodes) {
    // Unwrap the shared-component wrapper: emit its resolved blocks inline.
    if (node.type === "@component") {
      out.push(...serializeNodes(node.children ?? [], embed));
      continue;
    }
    const block: ApiBlock = { id: node.id, type: node.type, props: clean(node.props, embed) as Record<string, unknown> };
    if (node.children?.length) {
      const kids = serializeNodes(node.children, embed);
      if (kids.length) block.children = kids;
    }
    out.push(block);
  }
  return out;
}

export function serializeRelease(rel: LoadedRelease, embed = false): SiteContent {
  const t = rel.tokens;
  const pages = Object.values(rel.pages)
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((p) => ({
      path: p.path,
      title: p.title,
      blocks: serializeNodes(expandComponents(p.root, rel.components), embed),
    }));

  return {
    site: { name: rel.siteName, slug: rel.siteSlug, version: rel.versionNo, publishedAt: rel.createdAt },
    theme: {
      colors: {
        background: t.colorBg,
        foreground: t.colorFg,
        muted: t.colorMuted,
        accent: t.colorAccent,
        accentForeground: t.colorAccentFg,
        surface: t.colorSurface,
        border: t.colorBorder,
      },
      fonts: { heading: t.fontHeading, body: t.fontBody },
      radius: t.radius,
      maxWidth: t.maxWidth,
    },
    nav: rel.layout.nav,
    footer: rel.layout.footer,
    pages,
    data: clean(rel.data, embed),
  };
}
