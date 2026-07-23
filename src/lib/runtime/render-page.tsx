/**
 * Turning a loaded release into a rendered page — the shared half of the two
 * site routes (`/s/:slug/*` and the custom-domain rewrite).
 *
 * Both routes do exactly the same thing once they know which site they are for,
 * so the resolution and the rendering live here and the route files stay three
 * lines each.
 */
import React from "react";
import { notFound } from "next/navigation";
import { loadRelease, normalisePath, type LiveSite, type LoadedRelease } from "./release";
import { SiteBody } from "@/components/site/SiteBody";
import { CartBar } from "@/components/site/CartBar";
import { NotPublished, PageMissing } from "@/components/site/Empty";
import type { RenderContext } from "@/lib/registry/types";

export interface Resolved {
  site: LiveSite;
  release: LoadedRelease;
  path: string;
}

/**
 * Everything a request needs, or a reason it cannot be served.
 *
 * Note the single database read for the pointer and the single (usually cached)
 * read for the release. There is no filesystem access anywhere in this path.
 */
export async function resolveRequest(
  site: LiveSite | null,
  segments: string[] | undefined,
): Promise<
  | { kind: "ok"; resolved: Resolved }
  | { kind: "unpublished"; site: LiveSite }
  | { kind: "missing"; site: LiveSite; release: LoadedRelease; path: string }
  | { kind: "no-site" }
> {
  if (!site) return { kind: "no-site" };
  if (!site.liveReleaseId) return { kind: "unpublished", site };

  const release = await loadRelease(site.liveReleaseId);
  if (!release) return { kind: "unpublished", site };

  const path = normalisePath((segments ?? []).join("/"));
  if (!release.pages[path]) return { kind: "missing", site, release, path };

  return { kind: "ok", resolved: { site, release, path } };
}

export function contextFor(release: LoadedRelease): RenderContext {
  return {
    siteId: release.siteId,
    siteName: release.siteName,
    releaseId: release.id,
    runtimeApi: process.env.NEXT_PUBLIC_RUNTIME_API || "",
    tokens: release.tokens,
    products: release.data.products,
    collections: release.data.collections,
    media: release.data.media,
    components: release.components,
  };
}

/**
 * The rendered page.
 *
 * The provenance meta tags are not decoration: they are how you prove, from a
 * browser or from curl, that what you are looking at came from one specific
 * immutable release. `make verify` reads them.
 */
export function SitePage({ resolved }: { resolved: Resolved }) {
  const { release, path } = resolved;
  const page = release.pages[path];
  const ctx = contextFor(release);

  return (
    <>
      <meta name="cms:release-id" content={release.id} />
      <meta name="cms:release-version" content={`v${release.versionNo}`} />
      <meta name="cms:site-id" content={release.siteId} />
      <meta name="cms:path" content={page.path} />
      <meta name="cms:page-revision" content={page.revisionId} />
      <meta name="cms:frozen-at" content={release.data.frozenAt} />
      <title>{`${page.title} — ${release.siteName}`}</title>

      <SiteBody body={page.root} layout={release.layout} ctx={ctx}>
        {/* The one interactive island. Everything above it is server-rendered
            and ships no JavaScript. */}
        <CartBar
          siteId={release.siteId}
          releaseId={release.id}
          tokens={release.tokens}
          runtimeApi={ctx.runtimeApi}
        />
      </SiteBody>
    </>
  );
}

/** Shared body for both routes. Keeps the two route files identical in shape. */
export function renderResolved(
  outcome: Awaited<ReturnType<typeof resolveRequest>>,
): React.ReactElement {
  switch (outcome.kind) {
    case "ok":
      return <SitePage resolved={outcome.resolved} />;
    case "unpublished":
      return <NotPublished site={outcome.site} />;
    case "missing":
      return (
        <PageMissing
          site={outcome.site}
          path={outcome.path}
          version={outcome.release.versionNo}
        />
      );
    case "no-site":
      notFound();
  }
}
