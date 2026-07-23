"use client";

/**
 * The floating cart on a published site.
 *
 * This is the piece that used to be a hand-written string of vanilla JavaScript
 * baked into every artifact. On the hosted path it is now an ordinary React
 * component with ordinary state — which is most of what "deploy a Next.js app,
 * not a folder of HTML" buys you in practice.
 *
 * The exported artifact still ships the vanilla version, because an export has to
 * work from file:// with no bundle. Both talk to the same API and write the same
 * localStorage key, so a cart survives moving between them.
 *
 * The element ids below are kept identical to the exported script's, so the same
 * end-to-end test asserts the same behaviour on both paths.
 */
import { useState } from "react";
import { clearCart, countOf, money, totalOf, useCart } from "./cart-store";
import type { ThemeTokens } from "@/lib/registry/types";

export function CartBar({
  siteId,
  releaseId,
  tokens,
  runtimeApi,
}: {
  siteId: string;
  releaseId: string;
  tokens: ThemeTokens;
  runtimeApi: string;
}) {
  const lines = useCart(siteId);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const n = countOf(lines);

  async function checkout() {
    if (busy || lines.length === 0) return;
    setBusy(true);
    try {
      // The price sent is ignored by the server, which re-reads it from the
      // database (I14). A cart is a request, not an authority on what things cost.
      const res = await fetch(`${runtimeApi}/api/runtime/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          releaseId,
          items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        clearCart(siteId);
        setNote(`Order ${String(data.orderId).slice(0, 8)} placed — written to the orders table.`);
        setTimeout(() => setNote(null), 6000);
      }
    } catch {
      /* leave the cart intact so the visitor can retry */
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        id="cms-cart"
        style={{
          position: "fixed",
          left: "50%",
          bottom: 24,
          transform: n > 0 ? "translateY(0)" : "translateY(140%)",
          transition: "transform .28s cubic-bezier(.2,.8,.2,1)",
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: tokens.colorFg,
          color: tokens.colorBg,
          padding: "12px 12px 12px 22px",
          borderRadius: 999,
          fontFamily: tokens.fontBody,
          boxShadow: "0 18px 40px -12px rgba(0,0,0,.45)",
          marginLeft: -190,
          width: 380,
          boxSizing: "border-box",
        }}
      >
        <span id="cms-cart-count" style={{ fontSize: 14, fontWeight: 500 }}>
          {n} {n === 1 ? "item" : "items"}
        </span>
        <span id="cms-cart-total" style={{ fontSize: 14, opacity: 0.65, marginLeft: "auto" }}>
          {money(totalOf(lines))}
        </span>
        <button
          id="cms-cart-checkout"
          type="button"
          onClick={checkout}
          disabled={busy}
          style={{
            background: tokens.colorAccent,
            color: tokens.colorAccentFg,
            border: "none",
            padding: "10px 20px",
            borderRadius: 999,
            fontFamily: "inherit",
            fontWeight: 600,
            fontSize: 14,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Placing…" : "Checkout"}
        </button>
      </div>

      <div
        id="cms-cart-note"
        style={{
          display: note ? "block" : "none",
          position: "fixed",
          left: "50%",
          bottom: 86,
          transform: "translateX(-50%)",
          zIndex: 50,
          background: "#0b7a4b",
          color: "#fff",
          padding: "10px 18px",
          borderRadius: 999,
          fontFamily: tokens.fontBody,
          fontSize: 13,
          whiteSpace: "nowrap",
        }}
      >
        {note}
      </div>
    </>
  );
}
