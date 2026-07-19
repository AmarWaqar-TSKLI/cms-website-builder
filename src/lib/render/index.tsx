/**
 * Description → HTML.
 *
 * The build worker calls this. Nothing else does — in particular, the request
 * path for a live page NEVER calls this (non-negotiable #7). A visitor gets a
 * file read off disk, rendered minutes or weeks ago.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { getComponent } from "../registry";
import type { PageNode, RenderContext, ThemeLayout, ThemeTokens } from "../registry/types";
import { cartMarkup, runtimeScript } from "./runtime";

/** Recursively resolve node types through the registry and render them. */
export function renderNodes(nodes: PageNode[], ctx: RenderContext): ReactNode {
  return nodes.map((node) => {
    const entry = getComponent(node.type);
    if (!entry) {
      // An artifact built by an older codebase can name a component we removed.
      // Degrade visibly rather than throwing away the whole page.
      return (
        <div
          key={node.id}
          data-cms-unknown={node.type}
          style={{
            padding: "16px 24px",
            fontFamily: "ui-monospace, monospace",
            fontSize: "13px",
            color: "#a1a1aa",
            border: "1px dashed #3f3f46",
            margin: "12px 24px",
            borderRadius: "8px",
          }}
        >
          Unknown component “{node.type}”
        </div>
      );
    }
    const children = node.children?.length ? renderNodes(node.children, ctx) : undefined;
    return (
      <div key={node.id} data-cms-node={node.id} data-cms-type={node.type}>
        {entry.render({ node, props: node.props ?? {}, ctx, children })}
      </div>
    );
  });
}

function tokensToCss(t: ThemeTokens): string {
  return `:root{
  --cms-bg:${t.colorBg};
  --cms-fg:${t.colorFg};
  --cms-muted:${t.colorMuted};
  --cms-accent:${t.colorAccent};
  --cms-accent-fg:${t.colorAccentFg};
  --cms-surface:${t.colorSurface};
  --cms-border:${t.colorBorder};
  --cms-radius:${t.radius};
  --cms-max:${t.maxWidth};
}`;
}

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--cms-bg);color:var(--cms-fg);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{max-width:100%}
a{color:inherit}
button:disabled{opacity:.45;cursor:not-allowed}
@media (max-width:760px){
  [style*="grid-template-columns"]{grid-template-columns:1fr !important}
}
`.trim();

export interface RenderPageInput {
  title: string;
  path: string;
  body: PageNode[];
  layout: ThemeLayout;
  ctx: RenderContext;
  /** Stamped into the HTML so you can prove which release a served page came from. */
  releaseVersion: number;
  builtAt: string;
}

/**
 * A complete, self-contained HTML document.
 *
 * Self-contained is not a nicety here — it is the test of D9. Unzip the export,
 * double-click index.html from file://, and it must look and behave right with
 * no CSS build, no server, no bundler. That is why components use inline styles
 * and the runtime ships as one inline <script>.
 */
export function renderPageHtml(input: RenderPageInput): string {
  const { ctx } = input;
  const t = ctx.tokens;

  const main = renderToStaticMarkup(<>{renderNodes(input.body, ctx)}</>);
  const header = renderNav(input.layout, t);
  const footer = renderFooter(input.layout, t);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.title)} — ${escapeHtml(ctx.siteName)}</title>
<!-- Provenance. Every served byte can be traced to one immutable release. -->
<meta name="cms:release-id" content="${ctx.releaseId}">
<meta name="cms:release-version" content="v${input.releaseVersion}">
<meta name="cms:site-id" content="${ctx.siteId}">
<meta name="cms:built-at" content="${input.builtAt}">
<meta name="cms:path" content="${escapeHtml(input.path)}">
<style>
${tokensToCss(t)}
${BASE_CSS}
</style>
</head>
<body>
<header data-cms-region="header">${header}</header>
<main data-cms-region="body">${main}</main>
<footer data-cms-region="footer">${footer}</footer>
${cartMarkup(t)}
<script>${runtimeScript({ runtimeApi: ctx.runtimeApi, siteId: ctx.siteId, releaseId: ctx.releaseId })}</script>
</body>
</html>
`;
}

/** Site chrome, rendered from the versioned theme layout. Rolls back with everything else. */
function renderNav(layout: ThemeLayout, t: ThemeTokens): string {
  const nav = layout?.nav ?? { brand: "", links: [] };
  const links = (nav.links ?? [])
    .map(
      (l) =>
        `<a href="${escapeHtml(l.href)}" style="color:inherit;text-decoration:none;opacity:.72;font-size:14px">${escapeHtml(l.label)}</a>`,
    )
    .join("");
  return `<div style="border-bottom:1px solid ${t.colorBorder};background:${t.colorBg}">
  <div style="max-width:${t.maxWidth};margin:0 auto;padding:18px 24px;display:flex;align-items:center;gap:28px;font-family:${t.fontBody};color:${t.colorFg}">
    <a href="/" style="font-family:${t.fontHeading};font-weight:680;font-size:17px;letter-spacing:-.02em;text-decoration:none;color:inherit">${escapeHtml(nav.brand ?? "")}</a>
    <nav style="display:flex;gap:22px;margin-left:auto">${links}</nav>
  </div>
</div>`;
}

function renderFooter(layout: ThemeLayout, t: ThemeTokens): string {
  const f = layout?.footer ?? { text: "", links: [] };
  const links = (f.links ?? [])
    .map(
      (l) =>
        `<a href="${escapeHtml(l.href)}" style="color:inherit;text-decoration:none;opacity:.6;font-size:13px">${escapeHtml(l.label)}</a>`,
    )
    .join("");
  return `<div style="border-top:1px solid ${t.colorBorder};background:${t.colorSurface};margin-top:64px">
  <div style="max-width:${t.maxWidth};margin:0 auto;padding:36px 24px;display:flex;flex-wrap:wrap;gap:20px;align-items:center;font-family:${t.fontBody};color:${t.colorMuted};font-size:13px">
    <span>${escapeHtml(f.text ?? "")}</span>
    <nav style="display:flex;gap:20px;margin-left:auto">${links}</nav>
  </div>
</div>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
