/**
 * Product update and SOFT delete.
 *
 * Deleting is where D5's accepted cost surfaces. A release published last month
 * has a product's title and price baked into a file on disk; that file cannot
 * be un-published and must not be rewritten. So:
 *
 *   - deletes are soft (deleted_at), never destructive
 *   - the reverse dependency index is consulted first and returns 409 with the
 *     list of affected releases unless the caller acknowledges
 *   - a frozen page referencing a deleted product degrades to a visible
 *     placeholder rather than a crash
 *
 * Impossible was never on the table. Visible was.
 */
import { NextResponse } from "next/server";
import { guardProduct } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { releasesReferencing } from "@/lib/dependencies";
import { validateImageDataUri } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const auth = await guardProduct(productId);
  if (!auth.ok) return auth.response;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: true },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const references = await releasesReferencing("product", productId);
  return NextResponse.json({ product, references });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const auth = await guardProduct(productId);
  if (!auth.ok) return auth.response;
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  // imageUrl is optional: a valid data URI sets it, an empty string clears it,
  // and absence leaves it untouched.
  let imagePatch: { imageUrl: string | null } | Record<string, never> = {};
  if (payload.imageUrl !== undefined) {
    if (typeof payload.imageUrl === "string" && payload.imageUrl) {
      const valid = validateImageDataUri(payload.imageUrl);
      if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
      imagePatch = { imageUrl: valid.value.dataUri };
    } else {
      imagePatch = { imageUrl: null };
    }
  }

  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(payload.title !== undefined ? { title: String(payload.title) } : {}),
      ...(payload.description !== undefined ? { description: String(payload.description) } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(payload.restore ? { deletedAt: null } : {}),
      ...imagePatch,
    },
  });

  if (payload.priceCents !== undefined || payload.inventoryQty !== undefined) {
    const variant = await prisma.productVariant.findFirst({ where: { productId } });
    if (variant) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          ...(payload.priceCents !== undefined
            ? { priceCents: Math.max(0, Math.floor(Number(payload.priceCents))) }
            : {}),
          ...(payload.inventoryQty !== undefined
            ? { inventoryQty: Math.max(0, Math.floor(Number(payload.inventoryQty))) }
            : {}),
        },
      });
    }
  }

  // Note what did NOT happen: no artifact was rebuilt. Live pages keep showing
  // the values that were frozen into them until the next publish.
  return NextResponse.json({
    ok: true,
    product,
    note: "Live data changed. Published artifacts still show the values frozen at their build time — republish to refresh them.",
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const auth = await guardProduct(productId);
  if (!auth.ok) return auth.response;
  const acknowledge = new URL(req.url).searchParams.get("acknowledge") === "true";

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // "What breaks if I delete this?" — answered from release_dependencies.
  const references = await releasesReferencing("product", productId);
  const liveReferences = references.filter((r) => r.isLive);

  if (references.length > 0 && !acknowledge) {
    return NextResponse.json(
      {
        ok: false,
        requiresAcknowledgement: true,
        message:
          liveReferences.length > 0
            ? `“${product.title}” appears in ${references.length} published release(s), including the one currently live (v${liveReferences[0].versionNo}). Deleting it will leave a placeholder on the live page until you republish.`
            : `“${product.title}” appears in ${references.length} published release(s). Those releases stay rollback-able, and will show a placeholder where this product was.`,
        references,
      },
      { status: 409 },
    );
  }

  // SOFT delete. The row survives so old releases can still resolve it enough
  // to explain itself.
  await prisma.product.update({
    where: { id: productId },
    data: { deletedAt: new Date(), status: "archived" },
  });

  return NextResponse.json({
    ok: true,
    softDeleted: true,
    references,
    note: "Soft-deleted. Frozen pages that reference it now render a visible placeholder.",
  });
}
