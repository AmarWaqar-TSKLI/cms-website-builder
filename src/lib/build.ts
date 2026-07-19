/**
 * BUILD — job two of two. (D4)
 *
 * Slow, fallible, and completely isolated from the snapshot. It reads the
 * manifest, resolves live data, renders HTML files to disk, and only at the very
 * end flips sites.live_release_id.
 *
 * If any step throws, the release is marked failed and the site's live pointer
 * is never touched — visitors keep getting the previous artifact. There is a
 * test that kills a build mid-flight and asserts exactly that.
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db";
import { artifactsRoot, pathToFile, releaseDir } from "./paths";
import { renderPageHtml } from "./render";
import { asLayout, asTokens } from "./theme";
import { extractRefsFromBody, mergeRefs } from "./refs";
import type {
  PageBody,
  RenderContext,
  ResolvedCollection,
  ResolvedMedia,
  ResolvedProduct,
} from "./registry/types";

export { artifactsRoot, pathToFile, releaseDir } from "./paths";

export interface BuildOutcome {
  releaseId: string;
  files: string[];
  artifactUrl: string;
  durationMs: number;
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
  const themeItem = release.items.find((i) => i.entityType === "theme");
  if (pageItems.length === 0) throw new Error("Release pins no pages");

  const revisions = await prisma.pageRevision.findMany({
    where: { id: { in: pageItems.map((i) => i.revisionId) } },
    include: { page: true },
  });
  const themeRevision = themeItem
    ? await prisma.themeRevision.findUnique({ where: { id: themeItem.revisionId } })
    : null;

  const tokens = asTokens(themeRevision?.tokens);
  const layout = asLayout(themeRevision?.layout);

  // ── Resolve live (Tier-2) data referenced by these bodies ─────────────────
  // Snapshotting live data into a frozen file is D5's accepted cost, made
  // explicit here. Soft-deleted records resolve to `missing` rather than
  // disappearing, so the page degrades visibly instead of silently changing.
  const bodies = revisions.map((r) => r.body as unknown as PageBody);
  const refs = mergeRefs(bodies.map(extractRefsFromBody));

  const collectionIds = refs.filter((r) => r.refType === "collection").map((r) => r.refId);
  const mediaIds = refs.filter((r) => r.refType === "media").map((r) => r.refId);
  const directProductIds = refs.filter((r) => r.refType === "product").map((r) => r.refId);

  const collectionRows = collectionIds.length
    ? await prisma.collection.findMany({
        where: { id: { in: collectionIds } },
        include: { products: { orderBy: { position: "asc" } } },
      })
    : [];

  const collections: Record<string, ResolvedCollection> = {};
  for (const id of collectionIds) {
    const row = collectionRows.find((c) => c.id === id);
    collections[id] = row
      ? {
          id: row.id,
          title: row.title,
          handle: row.handle,
          productIds: row.products.map((p) => p.productId),
          missing: row.deletedAt !== null,
        }
      : { id, title: "(deleted collection)", handle: "", productIds: [], missing: true };
  }

  const productIds = [
    ...new Set([...directProductIds, ...Object.values(collections).flatMap((c) => c.productIds)]),
  ];
  const productRows = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { variants: { orderBy: { priceCents: "asc" }, take: 1 } },
      })
    : [];

  const products: Record<string, ResolvedProduct> = {};
  for (const id of productIds) {
    const row = productRows.find((p) => p.id === id);
    products[id] = row
      ? {
          id: row.id,
          title: row.title,
          description: row.description,
          imageUrl: row.imageUrl,
          priceCents: row.variants[0]?.priceCents ?? 0,
          variantId: row.variants[0]?.id ?? null,
          missing: row.deletedAt !== null || row.status === "archived",
        }
      : {
          id,
          title: "(deleted product)",
          description: "",
          imageUrl: null,
          priceCents: 0,
          variantId: null,
          missing: true,
        };
  }

  const mediaRows = mediaIds.length
    ? await prisma.media.findMany({ where: { id: { in: mediaIds } } })
    : [];
  const media: Record<string, ResolvedMedia> = {};
  for (const id of mediaIds) {
    const row = mediaRows.find((m) => m.id === id);
    media[id] = row
      ? { id: row.id, url: row.storageKey, alt: "", missing: row.deletedAt !== null }
      : { id, url: "", alt: "", missing: true };
  }

  const ctx: RenderContext = {
    siteId: release.siteId,
    siteName: release.site.name,
    releaseId: release.id,
    runtimeApi: process.env.NEXT_PUBLIC_RUNTIME_API || "http://localhost:3000",
    tokens,
    products,
    collections,
    media,
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
    durationMs: Date.now() - startedAt,
  };
}
