/**
 * The editor canvas needs the same resolved live data the build worker uses,
 * or "what you see is what gets published" would be a lie. Same shape as
 * RenderContext, resolved for the whole site rather than for one release's
 * dependency list.
 */
import { NextResponse } from "next/server";
import { guardSite } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { asLayout, asTokens } from "@/lib/theme";
import type { ResolvedCollection, ResolvedMedia, ResolvedProduct } from "@/lib/registry/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { modules: true, themes: { include: { revisions: true } } },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const theme = site.themes[0];
  const themeRevision = theme?.currentRevisionId
    ? theme.revisions.find((r) => r.id === theme.currentRevisionId)
    : theme?.revisions.sort((a, b) => b.versionNo - a.versionNo)[0];

  const [productRows, collectionRows, mediaRows] = await Promise.all([
    prisma.product.findMany({
      where: { siteId },
      include: { variants: { orderBy: { priceCents: "asc" }, take: 1 } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.collection.findMany({
      where: { siteId },
      include: { products: { orderBy: { position: "asc" } } },
      orderBy: { title: "asc" },
    }),
    prisma.media.findMany({ where: { siteId }, orderBy: { createdAt: "asc" } }),
  ]);

  const products: Record<string, ResolvedProduct> = {};
  for (const p of productRows) {
    products[p.id] = {
      id: p.id,
      title: p.title,
      description: p.description,
      imageUrl: p.imageUrl,
      priceCents: p.variants[0]?.priceCents ?? 0,
      variantId: p.variants[0]?.id ?? null,
      missing: p.deletedAt !== null || p.status === "archived",
    };
  }

  const collections: Record<string, ResolvedCollection> = {};
  for (const c of collectionRows) {
    collections[c.id] = {
      id: c.id,
      title: c.title,
      handle: c.handle,
      productIds: c.products.map((cp) => cp.productId),
      missing: c.deletedAt !== null,
    };
  }

  const media: Record<string, ResolvedMedia> = {};
  for (const m of mediaRows) {
    media[m.id] = { id: m.id, url: m.storageKey, alt: m.alt ?? "", missing: m.deletedAt !== null };
  }

  return NextResponse.json({
    siteId: site.id,
    siteName: site.name,
    slug: site.slug,
    modules: site.modules.map((m) => m.module),
    tokens: asTokens(themeRevision?.tokens),
    layout: asLayout(themeRevision?.layout),
    products,
    collections,
    media,
    // Reference-picker options, so the properties panel can offer real choices
    // instead of asking someone to paste a UUID.
    refOptions: {
      collection: collectionRows.map((c) => ({ value: c.id, label: c.title })),
      product: productRows.map((p) => ({ value: p.id, label: p.title })),
      media: mediaRows.map((m, i) => ({ value: m.id, label: m.filename ?? `Image ${i + 1}` })),
      post: [],
    },
  });
}
