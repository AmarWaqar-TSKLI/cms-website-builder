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
 *
 * Locale awareness (added for multi-locale sites): when a page is a translation
 * (`locale` set), the content is wrapped with `lang`/`dir` (so Arabic renders
 * RTL) and the nav links point at that locale's pages. `alternates` emits
 * `hreflang` <link>s so search engines see the translations as one page in many
 * languages. Both are inert for the default (untranslated) pages, so their output
 * is byte-identical to before.
 */
// Relative imports: this module is rendered by the build worker and the test
// runner too, both of which run outside Next's resolver.
import React from "react";
import { renderBody } from "../../lib/render";
import { resolveHref } from "../../lib/registry/style";
import { isRtl } from "../../lib/locales";
import type { PageNode, RenderContext, ThemeLayout } from "../../lib/registry/types";
import { SiteFooter, SiteNav, SiteStyles } from "./chrome";

export interface LocaleAlternate {
  /** Locale code, or "x-default" for the untranslated page. */
  code: string;
  /** The page's path for that locale, e.g. "/fr/about". */
  path: string;
}

export function SiteBody({
  body,
  layout,
  ctx,
  children,
  locale = null,
  alternates = [],
}: {
  body: PageNode[];
  layout: ThemeLayout;
  ctx: RenderContext;
  /** Interactive islands (the runtime passes the cart; the export passes nothing). */
  children?: React.ReactNode;
  /** Set on a translated page; drives lang/dir and localized nav links. */
  locale?: string | null;
  /** All locale variants of this page; emitted as hreflang links. */
  alternates?: LocaleAlternate[];
}) {
  const rtl = locale ? isRtl(locale) : false;

  const inner = (
    <>
      <SiteNav layout={layout} tokens={ctx.tokens} basePath={ctx.basePath} locale={locale} />
      <main>{renderBody(body, ctx)}</main>
      <SiteFooter layout={layout} tokens={ctx.tokens} basePath={ctx.basePath} locale={locale} />
      {children}
    </>
  );

  return (
    <>
      <SiteStyles tokens={ctx.tokens} />
      {alternates.length > 1 && <Hreflang basePath={ctx.basePath} alternates={alternates} />}
      {locale ? (
        <div lang={locale} dir={rtl ? "rtl" : "ltr"}>
          {inner}
        </div>
      ) : (
        inner
      )}
    </>
  );
}

/**
 * hreflang links (React 19 hoists <link> into <head>). URLs are path-relative
 * because the request host isn't known at render time — absolute URLs would be
 * strictly better for crawlers and are the obvious next step if this ships.
 */
function Hreflang({ basePath, alternates }: { basePath?: string; alternates: LocaleAlternate[] }) {
  return (
    <>
      {alternates.flatMap((a) => {
        const href = resolveHref(basePath, a.path);
        if (a.code === "x-default") {
          return [
            <link key="hl-en" rel="alternate" hrefLang="en" href={href} />,
            <link key="hl-xdefault" rel="alternate" hrefLang="x-default" href={href} />,
          ];
        }
        return [<link key={`hl-${a.code}`} rel="alternate" hrefLang={a.code} href={href} />];
      })}
    </>
  );
}
