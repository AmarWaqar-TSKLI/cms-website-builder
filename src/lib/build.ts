/**
 * BUILD — job two of two. (D4)
 *
 * Slow, fallible, and completely isolated from the snapshot. It reads the
 * manifest, FREEZES the live data the release references, prerenders the pages
 * to disk, and only at the very end flips sites.live_release_id.
 *
 * What changed when hosting moved to the runtime, and why the job still exists:
 *
 *   - Freezing Tier-2 data into `release_data` is now the load-bearing step.
 *     Until that row exists, the runtime refuses to render the release, because
 *     rendering it would mean reading live prices and the output would stop
 *     being reproducible. This is what makes a release a complete, immutable
 *     input rather than a set of pointers into moving data.
 *
 *   - Writing HTML files is no longer how anyone is served. It is how the export
 *     works, and a useful smoke test that the release really does render. The
 *     runtime never opens these files.
 *
 * If any step throws, the release is marked failed and the site's live pointer
 * is never touched — visitors keep getting the previous release. There is a test
 * that kills a build mid-flight and asserts exactly that.
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db";
import { artifactsRoot, pathToFile, releaseDir } from "./paths";
import { renderPageHtml } from "./render/html";
import { asLayout, asTokens } from "./theme";
import { extractRefsFromBody, mergeRefs } from "./refs";
import { freezeTierTwo } from "./runtime/snapshot";
import { postPageNodes, postPath } from "./post-page";
import { displayNameOf } from "./shared-components";
import type { PageBody, RenderContext, ResolvedComponent } from "./registry/types";

export { artifactsRoot, pathToFile, releaseDir } from "./paths";

export interface BuildOutcome {
  releaseId: string;
  files: string[];
  artifactUrl: string;
  durationMs: number;
  /** For the worker's after-care (warming, publish webhooks). Not the build itself. */
  slug: string;
  paths: string[];
  siteId: string;
  versionNo: number;
}

export async function buildRelease(releaseId: string): Promise<BuildOutcome> {
  const startedAt = Date.now();

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { site: true, items: true },
  });
  if (!release) throw new Error(`Release ${releaseId} not found`);

  // ── Read the manifest. This is the ONLY input. ────────────────────────────
  const pageItems = release.items.filter((i) => i.entityType === "page");
  const componentItems = release.items.filter((i) => i.entityType === "component");
  const themeItem = release.items.find((i) => i.entityType === "theme");
  if (pageItems.length === 0) throw new Error("Release pins no pages");

  const revisions = await prisma.pageRevision.findMany({
    where: { id: { in: pageItems.map((i) => i.revisionId) } },
    include: { page: true },
  });
  const themeRevision = themeItem
    ? await prisma.themeRevision.findUnique({ where: { id: themeItem.revisionId } })
    : null;

  // ── Shared components, as this release pinned them ────────────────────────
  // Read by REVISION id, never by component id. That distinction is the whole
  // feature: rebuilding a two-year-old release renders the header that release
  // shipped with, not the one the symbol has today.
  const componentRevisions = componentItems.length
    ? await prisma.componentRevision.findMany({
        where: { id: { in: componentItems.map((i) => i.revisionId) } },
        include: { component: true },
      })
    : [];

  const components: Record<string, ResolvedComponent> = {};
  for (const rev of componentRevisions) {
    components[rev.componentId] = {
      id: rev.componentId,
      name: displayNameOf(rev.component),
      root: ((rev.body as unknown) as PageBody)?.root ?? [],
      revisionId: rev.id,
      // NOT marked missing when the symbol has since been soft-deleted. This is
      // the sharp line between the two tiers, and it is worth being exact about:
      //
      //   a deleted PRODUCT degrades a built page, because Tier-2 data is live
      //   by design and the artifact only ever held a snapshot of it (D5);
      //
      //   a deleted COMPONENT does not, because the revision this release pinned
      //   is Tier-1 and immutable. Deleting the symbol removes it from the
      //   palette and from future publishes. It cannot reach back and change
      //   what an already-published release renders.
      //
      // Without this, rebuilding an old release would produce different bytes
      // than the first build did, and "immutable artifact" would be a fiction.
      missing: false,
    };
  }

  const tokens = asTokens(themeRevision?.tokens);
  const layout = asLayout(themeRevision?.layout);

  // ── Which live (Tier-2) records do these bodies reference? ────────────────
  //
  // Symbol bodies are extracted from too. A ProductGrid living inside a shared
  // footer references products just as much as one placed directly on a page,
  // and those products' titles and prices get frozen into every page that uses
  // the footer. Miss this and those pages render "(deleted product)" for data
  // that is perfectly present.
  const bodies = [
    ...revisions.map((r) => r.body as unknown as PageBody),
    ...componentRevisions.map((r) => r.body as unknown as PageBody),
  ];
  const refs = mergeRefs(bodies.map(extractRefsFromBody));

  // ── THE STEP THAT MAKES A RELEASE COMPLETE ────────────────────────────────
  // Resolve every Tier-2 record these bodies reference and write it once, to a
  // row that can never be updated. From here on this release renders the same
  // thing forever, from the runtime or from an export, today or in two years.
  //
  // A retry reuses what the first attempt froze rather than re-resolving, so a
  // build that fails and is retried an hour later cannot quietly publish a
  // different price.
  const frozen = await freezeTierTwo(release.id, bodies);
  const { products, collections, media, posts } = frozen;

  const ctx: RenderContext = {
    siteId: release.siteId,
    siteName: release.site.name,
    releaseId: release.id,
    runtimeApi: process.env.NEXT_PUBLIC_RUNTIME_API || "http://localhost:3000",
    tokens,
    products,
    collections,
    media,
    posts,
    components,
  };

  // ── Render to disk ────────────────────────────────────────────────────────
  const outDir = releaseDir(release.siteId, release.id);
  // A retry of a failed build starts from a clean directory. A SUCCEEDED
  // release's directory is never touched again — that is what immutable means.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const builtAt = new Date().toISOString();
  const written: string[] = [];
  const slowdown = Number(process.env.BUILD_SLOWDOWN_MS || 0);
  const failOnPath = process.env.BUILD_FAIL_ON_PATH || "";

  for (const revision of revisions) {
    const page = revision.page;

    // Deliberate failure injection, used by the crash-safety test.
    if (failOnPath && page.path === failOnPath) {
      throw new Error(`Injected build failure while rendering ${page.path}`);
    }
    if (slowdown > 0) await new Promise((r) => setTimeout(r, slowdown));

    const html = renderPageHtml({
      title: page.title,
      path: page.path,
      body: (revision.body as unknown as PageBody)?.root ?? [],
      layout,
      ctx,
      releaseVersion: release.versionNo,
      builtAt,
    });

    const rel = pathToFile(page.path);
    const dest = path.join(outDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, html, "utf8");
    written.push(rel.split(path.sep).join("/"));
  }

  // Post-detail pages, rendered from the frozen posts any page referenced. Same
  // renderer, so an exported zip carries real /blog/<slug>/ pages, not just the
  // teaser lists that link to them.
  for (const post of Object.values(posts)) {
    if (post.missing) continue;
    const html = renderPageHtml({
      title: post.title,
      path: postPath(post.slug),
      body: postPageNodes(post),
      layout,
      ctx,
      releaseVersion: release.versionNo,
      builtAt,
    });
    const rel = pathToFile(postPath(post.slug));
    const dest = path.join(outDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, html, "utf8");
    written.push(rel.split(path.sep).join("/"));
  }

  // Manifest travels with the artifact so an exported zip is self-describing.
  await writeFile(
    path.join(outDir, "cms-manifest.json"),
    JSON.stringify(
      {
        siteId: release.siteId,
        siteName: release.site.name,
        releaseId: release.id,
        version: release.versionNo,
        builtAt,
        pages: revisions.map((r) => ({
          path: r.page.path,
          file: pathToFile(r.page.path).split(path.sep).join("/"),
          revisionId: r.id,
          revisionVersion: r.versionNo,
        })),
        // Which revision of each shared component this artifact was built from.
        // An exported zip is then self-describing all the way down.
        components: componentRevisions.map((r) => ({
          id: r.componentId,
          name: r.component.name,
          revisionId: r.id,
          revisionVersion: r.versionNo,
        })),
        dependencies: refs,
      },
      null,
      2,
    ),
    "utf8",
  );
  written.push("cms-manifest.json");

  const artifactUrl = `/s/${release.site.slug}`;

  // ── Only now does this release become real ────────────────────────────────
  await prisma.$transaction([
    prisma.release.update({
      where: { id: release.id },
      data: { status: "ready", artifactUrl, buildError: null },
    }),
    // THE POINTER SWAP. One column. Everything a visitor sees changes here,
    // and nothing was rendered to make it happen.
    prisma.site.update({
      where: { id: release.siteId },
      data: { liveReleaseId: release.id },
    }),
  ]);

  return {
    releaseId: release.id,
    files: written,
    artifactUrl,
    slug: release.site.slug,
    paths: revisions.map((r) => r.page.path),
    siteId: release.siteId,
    versionNo: release.versionNo,
    durationMs: Date.now() - startedAt,
  };
}
