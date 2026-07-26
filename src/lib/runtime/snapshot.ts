/**
 * Freezing Tier-2 data into a release.
 *
 * D5 splits the world in two: pages are versioned, products and orders are live.
 * That split has an accepted cost — a published page shows the product titles and
 * prices that were true when it was published, and those can drift from the
 * database afterwards.
 *
 * The old design paid that cost by baking the values into an HTML file. This one
 * pays it by writing them to `release_data` once, before the release goes live.
 * Same semantics, one important gain: rendering a release is now a pure function
 * of rows that can never change, so the runtime can render on demand and still
 * produce the same bytes every time.
 *
 * Note what is NOT frozen: anything a visitor's actions change. Stock levels at
 * checkout and the price actually charged are re-read live (I14). Freezing is for
 * what the page *says*, never for what the transaction *does*.
 */
import { prisma } from "../db";
import { extractRefsFromBody, mergeRefs } from "../refs";
import type {
  PageBody,
  ResolvedCollection,
  ResolvedMedia,
  ResolvedPost,
  ResolvedProduct,
} from "../registry/types";

export interface FrozenTierTwo {
  products: Record<string, ResolvedProduct>;
  collections: Record<string, ResolvedCollection>;
  media: Record<string, ResolvedMedia>;
  posts: Record<string, ResolvedPost>;
  /** When this snapshot was taken. Stamped into the page for provenance. */
  frozenAt: string;
}

/**
 * Resolve every Tier-2 record the given bodies reference.
 *
 * Soft-deleted records resolve to `missing` rather than vanishing, so a page
 * degrades visibly instead of silently changing shape. Collections fan out to
 * their products, because those products' titles and prices are what the page
 * will show.
 */
export async function resolveTierTwo(bodies: PageBody[]): Promise<FrozenTierTwo> {
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
      ? { id: row.id, url: row.storageKey, alt: row.alt ?? "", missing: row.deletedAt !== null }
      : { id, url: "", alt: "", missing: true };
  }

  // Posts freeze exactly like products: the list shows the title, excerpt and
  // date that were true at build time. A post that was deleted, or is no longer
  // published, resolves to `missing` so the list drops it rather than breaking.
  const postIds = refs.filter((r) => r.refType === "post").map((r) => r.refId);
  const postRows = postIds.length
    ? await prisma.post.findMany({ where: { id: { in: postIds } } })
    : [];
  const posts: Record<string, ResolvedPost> = {};
  for (const id of postIds) {
    const row = postRows.find((p) => p.id === id);
    posts[id] = row
      ? {
          id: row.id,
          title: row.title,
          slug: row.slug,
          excerpt: row.excerpt,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          missing: row.deletedAt !== null || row.status !== "published",
        }
      : { id, title: "(deleted post)", slug: "", excerpt: "", publishedAt: null, missing: true };
  }

  return { products, collections, media, posts, frozenAt: new Date().toISOString() };
}

/**
 * Freeze once, reuse forever.
 *
 * A retried build must NOT re-resolve: the first attempt already decided what
 * this release says, and a retry an hour later must not quietly publish a
 * different price. The append-only trigger on release_data enforces this at the
 * database too — this function simply never asks it to.
 */
export async function freezeTierTwo(
  releaseId: string,
  bodies: PageBody[],
): Promise<FrozenTierTwo> {
  const existing = await prisma.releaseData.findUnique({ where: { releaseId } });
  if (existing) return existing.data as unknown as FrozenTierTwo;

  const resolved = await resolveTierTwo(bodies);
  await prisma.releaseData.create({
    data: { releaseId, data: resolved as never },
  });
  return resolved;
}
