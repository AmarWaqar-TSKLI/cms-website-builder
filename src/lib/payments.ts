/**
 * Payments — Stripe Checkout over plain fetch, env-gated like every other
 * integration (no SDK; Stripe's REST API is form-encoded HTTP).
 *
 * Unset, checkout keeps the demo behaviour: an order is written as `paid`
 * immediately and inventory decrements on the spot. With STRIPE_SECRET_KEY set,
 * the flow becomes real: the order is written as `pending`, the visitor is sent
 * to Stripe's hosted page, and ONLY the signature-verified webhook flips it to
 * `paid` and touches inventory. The client never decides that money moved.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";

export function paymentsConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.trim();
}

export interface CheckoutLine {
  title: string;
  qty: number;
  priceCents: number;
}

/** Create a hosted Checkout Session; returns the URL to send the visitor to. */
export async function createCheckoutSession(args: {
  orderId: string;
  lines: CheckoutLine[];
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const key = process.env.STRIPE_SECRET_KEY!.trim();
  const currency = (process.env.CHECKOUT_CURRENCY ?? "usd").toLowerCase();

  // Stripe's API takes application/x-www-form-urlencoded with bracket keys.
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", args.successUrl);
  form.set("cancel_url", args.cancelUrl);
  form.set("metadata[orderId]", args.orderId);
  args.lines.forEach((line, i) => {
    form.set(`line_items[${i}][quantity]`, String(line.qty));
    form.set(`line_items[${i}][price_data][currency]`, currency);
    form.set(`line_items[${i}][price_data][unit_amount]`, String(line.priceCents));
    form.set(`line_items[${i}][price_data][product_data][name]`, line.title.slice(0, 120));
  });

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Stripe returned ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id?: string; url?: string };
  if (!data.id || !data.url) throw new Error("Stripe response missing session url");
  return { id: data.id, url: data.url };
}

/**
 * Verify a `Stripe-Signature` header against the raw request body.
 *
 * The scheme is documented and simple: the header carries `t=<unix>,v1=<hex>`,
 * where v1 = HMAC-SHA256(secret, `${t}.${body}`). Constant-time compare, and a
 * 5-minute tolerance on t so a replayed capture goes stale.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!signatureHeader) return false;
  const parts = new Map(
    signatureHeader.split(",").map((p) => {
      const at = p.indexOf("=");
      return [p.slice(0, at).trim(), p.slice(at + 1).trim()] as const;
    }),
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1 || !/^\d+$/.test(t)) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > 300) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
