/**
 * SEO surface, derived — not stored.
 *
 * Everything here is a pure function of the immutable release, which is the
 * point: the sitemap and a page's description are as cacheable and as
 * rollback-consistent as the pages themselves. No new columns, no second
 * source of truth to drift; when a page's copy changes, its description
 * changes at the next publish, in the same release.
 */
import { getSchema } from "./registry";
import { expandComponents } from "./shared-components";
import type { PageNode, ResolvedComponent } from "./registry/types";
import type { LoadedRelease } from "./runtime/release";

/** XML-escape a text value. */
const esc = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/**
 * A page's meta description: the first substantial paragraph-like text on it.
 * Prefers textarea props (body copy) over headlines, clips to ~160 chars at a
 * word boundary — the classic snippet length.
 */
export function deriveDescription(
  root: PageNode[],
  components: Record<string, ResolvedComponent>,
): string {
  const nodes = expandComponents(root, components);
  let headline = "";
  const firstText = (list: PageNode[]): string => {
    for (const n of list) {
      const schema = getSchema(n.type);
      if (schema) {
        for (const [k, def] of Object.entries(schema.props)) {
          const v = n.props?.[k];
          if (typeof v !== "string" || v.trim().length < 40) continue;
          if (def.kind === "textarea") return v.trim();
          if (def.kind === "text" && !headline) headline = v.trim();
        }
      }
      if (n.children?.length) {
        const found = firstText(n.children);
        if (found) return found;
      }
    }
    return "";
  };
  const text = firstText(nodes) || headline;
  if (text.length <= 160) return text;
  const cut = text.slice(0, 157);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 120))}…`;
}

/** The release's pages as a sitemap. `origin` is the public scheme+host. */
export function sitemapXml(release: LoadedRelease, origin: string, basePath = ""): string {
  const lastmod = release.createdAt.slice(0, 10);
  const urls = Object.values(release.pages)
    .map((p) => `${origin}${basePath}${p.path === "/" ? "" : p.path}`)
    .sort()
    .map((loc) => `  <url><loc>${esc(loc || `${origin}${basePath}`)}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** robots.txt for a custom domain: allow everything, point at the sitemap. */
export function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}
