import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Tier 2. No revisions, no releases — products are live data, full stop. (D5) */
export async function GET(req: Request) {
  const siteId = new URL(req.url).searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const products = await prisma.product.findMany({
    where: { siteId },
    include: {
      variants: { orderBy: { priceCents: "asc" } },
      collections: { include: { collection: { select: { id: true, title: true, handle: true } } } },
    },
    orderBy: [{ deletedAt: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      imageUrl: p.imageUrl,
      status: p.status,
      deletedAt: p.deletedAt,
      priceCents: p.variants[0]?.priceCents ?? 0,
      inventoryQty: p.variants[0]?.inventoryQty ?? 0,
      variantId: p.variants[0]?.id ?? null,
      sku: p.variants[0]?.sku ?? "",
      collections: p.collections.map((c) => c.collection),
    })),
  });
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  if (!payload?.siteId || !payload?.title) {
    return NextResponse.json({ error: "siteId and title required" }, { status: 400 });
  }

  const product = await prisma.product.create({
    data: {
      siteId: payload.siteId,
      title: String(payload.title),
      description: String(payload.description ?? ""),
      status: "active",
      variants: {
        create: {
          sku: String(payload.sku ?? `SKU-${Date.now().toString(36).toUpperCase()}`),
          priceCents: Math.max(0, Math.floor(Number(payload.priceCents) || 0)),
          inventoryQty: Math.max(0, Math.floor(Number(payload.inventoryQty) || 0)),
          options: {},
        },
      },
    },
    include: { variants: true },
  });

  // Adding a product changes nothing about any existing artifact. A live page
  // built yesterday keeps showing yesterday's products until someone publishes.
  if (payload.collectionId) {
    const count = await prisma.collectionProduct.count({
      where: { collectionId: payload.collectionId },
    });
    await prisma.collectionProduct.create({
      data: { collectionId: payload.collectionId, productId: product.id, position: count },
    });
  }

  return NextResponse.json({ ok: true, product });
}
