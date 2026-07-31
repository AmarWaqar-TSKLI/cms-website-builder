/**
 * The body of a published page: chrome, then the blocks, then chrome.
 *
 * ONE component, rendered by both hosts:
 *   - the runtime route renders it as RSC and streams it to the visitor
 *   - the export renders it with renderToStaticMarkup and writes it to a file
 *
 * That is the whole reason it exists. Two renderers producing "the same" page is
 * a promise nobody can keep; one component rendered twice is a fact. It is also
 * why `make verify` can assert the runtime and the export agree byte for byte.
 */
// Relative imports: this module is rendered by the build worker and the test
// runner too, both of which run outside Next's resolver.
import React from "react";
import { renderBody } from "../../lib/render";
import type { PageNode, RenderContext, ThemeLayout } from "../../lib/registry/types";
import { SiteFooter, SiteNav, SiteStyles } from "./chrome";

export function SiteBody({
  body,
  layout,
  ctx,
  children,
}: {
  body: PageNode[];
  layout: ThemeLayout;
  ctx: RenderContext;
  /** Interactive islands (the runtime passes the cart; the export passes nothing). */
  children?: React.ReactNode;
}) {
  return (
    <>
      <SiteStyles tokens={ctx.tokens} />
      <SiteNav layout={layout} tokens={ctx.tokens} basePath={ctx.basePath} />
      <main>{renderBody(body, ctx)}</main>
      <SiteFooter layout={layout} tokens={ctx.tokens} basePath={ctx.basePath} />
      {children}
    </>
  );
}
