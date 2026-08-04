/**
 * The Stripe webhook — the ONLY code allowed to say a payment happened.
 *
 * Signature-verified against the RAW body (parse-then-verify is a classic
 * mistake: the signature covers bytes, not JSON), idempotent (only a still-
 * pending order transitions), and inventory moves here rather than at checkout
 * so an abandoned cart never eats stock.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyStripeSignature } from "@/lib/payments";
import { captureError } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const rawBody = await req.text();
  if (!verifyStripeSignature(rawBody, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: { metadata?: { orderId?: string } } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Everything else Stripe sends is acknowledged and ignored — returning non-200
  // would only make Stripe retry events we don't act on.
  if (event.type !== "checkout.session.completed") return NextResponse.json({ received: true });

  const orderId = event.data?.object?.metadata?.orderId;
  if (!orderId) return NextResponse.json({ received: true });

  try {
    await prisma.$transaction(async (tx) => {
      // Idempotency: a retried webhook finds the order already paid and stops.
      const order = await tx.order.findFirst({
        where: { id: orderId, status: "pending" },
        include: { lineItems: true },
      });
      if (!order) return;
      await tx.order.update({ where: { id: order.id }, data: { status: "paid" } });
      for (const line of order.lineItems) {
        await tx.productVariant.update({
          where: { id: line.variantId },
          data: { inventoryQty: { decrement: line.qty } },
        });
      }
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    captureError(err, { scope: "webhooks.stripe", orderId });
    // 500 → Stripe retries with backoff, which is exactly what we want here.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
