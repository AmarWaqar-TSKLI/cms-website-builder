/**
 * React → one self-contained HTML document. THE EXPORT PATH, and only that.
 *
 * Kept in its own module because it imports react-dom/server, and nothing the
 * hosted runtime can reach is allowed to. Next enforces this at build time: put
 * an import to this file anywhere under a Server Component and the build fails.
 *
 * That guard is the successor to the old "serve.ts cannot import a renderer"
 * rule. The rule changed shape when serving became rendering, but the intent did
 * not: the request path must never be able to produce a document out of live
 * state. It renders one immutable release, or it renders nothing.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteBody } from "../../components/site/SiteBody";
import type { PageNode, RenderContext, ThemeLayout } from "../registry/types";
import { cartMarkup, runtimeScript } from "./runtime";

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
 * A complete, self-contained HTML document — the EXPORT path.
 *
 * Self-contained is not a nicety here: unzip the export, double-click
 * index.html from file://, and it must look and behave right with no CSS build,
 * no server and no bundler. That is why the components use inline styles and why
 * this path still ships one inline <script> instead of a React bundle.
 *
 * The important detail is what it renders: `<SiteBody>`, the very same component
 * the hosted runtime renders. The two paths differ in exactly two ways — this one
 * goes through renderToStaticMarkup and appends the vanilla cart script; the
 * runtime streams RSC and mounts <CartBar/> instead. Everything above that line
 * is one implementation, so "the export matches the hosted site" is structural
 * rather than something a test has to keep catching.
 */
export function renderPageHtml(input: RenderPageInput): string {
  const { ctx } = input;
  const t = ctx.tokens;

  const document = renderToStaticMarkup(
    <SiteBody body={input.body} layout={input.layout} ctx={ctx} />,
  );

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
</head>
<body>
${document}
${cartMarkup(t)}
<script>${runtimeScript({ runtimeApi: ctx.runtimeApi, siteId: ctx.siteId, releaseId: ctx.releaseId })}</script>
</body>
</html>
`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
