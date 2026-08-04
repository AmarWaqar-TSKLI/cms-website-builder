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
import { SiteBody, type LocaleAlternate } from "@/components/site/SiteBody";
import { CartBar } from "@/components/site/CartBar";
import { NotPublished, PageMissing } from "@/components/site/Empty";
import type { RenderContext, ResolvedPost } from "@/lib/registry/types";
import { postPageNodes, postPath } from "@/lib/post-page";
import { localeOf, stripLocale } from "@/lib/locales";
import { deriveDescription } from "@/lib/seo";

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
  | { kind: "post"; site: LiveSite; release: LoadedRelease; post: ResolvedPost }
  | { kind: "unpublished"; site: LiveSite }
  | { kind: "missing"; site: LiveSite; release: LoadedRelease; path: string }
  | { kind: "no-site" }
> {
  if (!site) return { kind: "no-site" };
  if (!site.liveReleaseId) return { kind: "unpublished", site };

  const release = await loadRelease(site.liveReleaseId);
  if (!release) return { kind: "unpublished", site };

  const path = normalisePath((segments ?? []).join("/"));
  if (release.pages[path]) return { kind: "ok", resolved: { site, release, path } };

  // No page at this path — it may be a blog post. Posts live at /blog/<slug> and
  // are resolved from the release's frozen data, same as everything else on the
  // request path: no live lookup, deterministic, and only what this release
  // froze. A post that isn't in the frozen set has no page here.
  const post = findFrozenPost(release, path);
  if (post) return { kind: "post", site, release, post };

  return { kind: "missing", site, release, path };
}

/** A published, non-missing post whose slug matches `/blog/<slug>`. */
function findFrozenPost(release: LoadedRelease, path: string): ResolvedPost | null {
  const prefix = "/blog/";
  if (!path.startsWith(prefix)) return null;
  const slug = path.slice(prefix.length);
  if (!slug) return null;
  const posts = release.data.posts ?? {};
  return Object.values(posts).find((p) => p.slug === slug && !p.missing) ?? null;
}

/**
 * The locale of the requested page and every locale variant of it, computed from
 * the release's own page set. `alternates` is what becomes hreflang links; it
 * only has more than one entry once the site has actually been translated.
 */
function localeInfo(
  release: LoadedRelease,
  path: string,
): { locale: string | null; alternates: LocaleAlternate[] } {
  const logical = stripLocale(path);
  const alternates: LocaleAlternate[] = Object.values(release.pages)
    .filter((p) => stripLocale(p.path) === logical)
    .map((p) => ({ code: localeOf(p.path) ?? "x-default", path: p.path }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return { locale: localeOf(path), alternates };
}

export function contextFor(release: LoadedRelease, basePath = ""): RenderContext {
  return {
    siteId: release.siteId,
    siteName: release.siteName,
    releaseId: release.id,
    runtimeApi: process.env.NEXT_PUBLIC_RUNTIME_API || "",
    tokens: release.tokens,
    products: release.data.products,
    collections: release.data.collections,
    media: release.data.media,
    // Releases built before the blog module have no frozen posts.
    posts: release.data.posts ?? {},
    components: release.components,
    // "" on a custom domain / export / editor; "/s/<slug>" on the hosted route.
    basePath,
  };
}

/**
 * Description + social-card tags, derived from the release (lib/seo.ts) — no
 * stored SEO fields to drift from the content. Empty description → no tags, so
 * a sparse page never ships an empty meta.
 */
function SeoMeta({ title, description }: { title: string; description: string }) {
  return (
    <>
      {description ? <meta name="description" content={description} /> : null}
      <meta property="og:title" content={title} />
      {description ? <meta property="og:description" content={description} /> : null}
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary" />
    </>
  );
}

/**
 * The rendered page.
 *
 * The provenance meta tags are not decoration: they are how you prove, from a
 * browser or from curl, that what you are looking at came from one specific
 * immutable release. `make verify` reads them.
 */
export function SitePage({ resolved, basePath = "" }: { resolved: Resolved; basePath?: string }) {
  const { release, path } = resolved;
  const page = release.pages[path];
  const ctx = contextFor(release, basePath);
  const { locale, alternates } = localeInfo(release, path);

  return (
    <>
      <meta name="cms:release-id" content={release.id} />
      <meta name="cms:release-version" content={`v${release.versionNo}`} />
      <meta name="cms:site-id" content={release.siteId} />
      <meta name="cms:path" content={page.path} />
      <meta name="cms:page-revision" content={page.revisionId} />
      <meta name="cms:frozen-at" content={release.data.frozenAt} />
      <title>{`${page.title} — ${release.siteName}`}</title>
      <SeoMeta
        title={`${page.title} — ${release.siteName}`}
        description={deriveDescription(page.root, release.components)}
      />

      <SiteBody
        body={page.root}
        layout={release.layout}
        ctx={ctx}
        locale={locale}
        alternates={alternates}
      >
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

/**
 * A published blog post, rendered as a page.
 *
 * It goes through the very same SiteBody and renderer as a page — the post is
 * turned into a small tree of blocks (postPageNodes) and everything else is
 * identical. So a post inherits the site's theme and chrome for free, and it is
 * as deterministic as any other page.
 */
export function SitePostPage({
  release,
  post,
  basePath = "",
}: {
  release: LoadedRelease;
  post: ResolvedPost;
  basePath?: string;
}) {
  const ctx = contextFor(release, basePath);
  const nodes = postPageNodes(post);

  return (
    <>
      <meta name="cms:release-id" content={release.id} />
      <meta name="cms:release-version" content={`v${release.versionNo}`} />
      <meta name="cms:site-id" content={release.siteId} />
      <meta name="cms:path" content={postPath(post.slug)} />
      <meta name="cms:frozen-at" content={release.data.frozenAt} />
      <title>{`${post.title} — ${release.siteName}`}</title>
      <SeoMeta
        title={`${post.title} — ${release.siteName}`}
        description={(post.excerpt || post.body).trim().slice(0, 160)}
      />

      <SiteBody body={nodes} layout={release.layout} ctx={ctx}>
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

/**
 * Shared body for both routes. Keeps the two route files identical in shape.
 *
 * `basePath` is the prefix same-site links must carry: "" for a custom domain
 * (the site is the root) and "/s/<slug>" for the hosted address.
 */
export function renderResolved(
  outcome: Awaited<ReturnType<typeof resolveRequest>>,
  basePath = "",
): React.ReactElement {
  switch (outcome.kind) {
    case "ok":
      return <SitePage resolved={outcome.resolved} basePath={basePath} />;
    case "post":
      return <SitePostPage release={outcome.release} post={outcome.post} basePath={basePath} />;
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
