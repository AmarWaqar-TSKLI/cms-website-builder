/**
 * THE RUNTIME API — what makes D8 true.
 *
 * A static file on disk, possibly unzipped onto someone else's static host,
 * calls this endpoint. An order row appears in the database. The HTML file is
 * not touched, not regenerated, and its checksum does not change.
 *
 * "Static" means no server rendered the page. It does not mean the page is
 * dead. The line is "does a visitor cause a change", and here they plainly do —
 * to live data, never to the artifact.
 *
 * CORS is wide open on purpose: an exported artifact is expected to run on a
 * different origin, or none at all (file://). That is the whole point of the
 * escape hatch.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

interface CartItem {
  variantId: string;
  qty: number;
}

export async function POST(req: Request) {
  let payload: { siteId?: string; releaseId?: string; items?: CartItem[] };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const { siteId, items } = payload;
  if (!siteId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "siteId and items required" }, { status: 400, headers: CORS });
  }

  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!site) return NextResponse.json({ error: "Unknown site" }, { status: 404, headers: CORS });

  // Prices come from the database, never from the client. The artifact's baked-in
  // price is a display value that may be weeks stale; what someone is charged is
  // decided here, now.
  const variantIds = [...new Set(items.map((i) => i.variantId))].filter(Boolean);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: { select: { title: true, siteId: true, deletedAt: true } } },
  });

  const lines = items
    .map((item) => {
      const variant = variants.find((v) => v.id === item.variantId);
      if (!variant || variant.product.siteId !== siteId || variant.product.deletedAt) return null;
      const qty = Math.max(1, Math.min(99, Math.floor(Number(item.qty) || 1)));
      return {
        variantId: variant.id,
        qty,
        // SNAPSHOT — order history must never be rewritten by a later price change.
        priceAtPurchaseCents: variant.priceCents,
        titleAtPurchase: variant.product.title,
      };
    })
    .filter(Boolean) as {
    variantId: string;
    qty: number;
    priceAtPurchaseCents: number;
    titleAtPurchase: string;
  }[];

  if (lines.length === 0) {
    return NextResponse.json(
      { error: "No purchasable items in cart" },
      { status: 409, headers: CORS },
    );
  }

  const totalCents = lines.reduce((sum, l) => sum + l.qty * l.priceAtPurchaseCents, 0);

  // FAKED: no payment processor. The order is written as `paid` immediately.
  const order = await prisma.order.create({
    data: {
      siteId,
      status: "paid",
      totalCents,
      lineItems: { create: lines },
    },
    select: { id: true, totalCents: true, placedAt: true },
  });

  // Live data changes; the artifact does not. Orders are Tier 2 — this row will
  // not roll back when the site's appearance does.
  await Promise.all(
    lines.map((l) =>
      prisma.productVariant.update({
        where: { id: l.variantId },
        data: { inventoryQty: { decrement: l.qty } },
      }),
    ),
  );

  return NextResponse.json(
    {
      ok: true,
      orderId: order.id,
      totalCents: order.totalCents,
      placedAt: order.placedAt,
      note: "Written to `orders`. The HTML file that triggered this was not modified.",
    },
    { headers: CORS },
  );
}
