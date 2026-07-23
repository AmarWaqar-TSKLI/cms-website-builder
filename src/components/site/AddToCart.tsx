"use client";

/**
 * The add-to-cart button — one component, two hosts.
 *
 * Rendered from inside the component registry, so it appears in three places
 * that could not be more different, and has to be correct in all of them:
 *
 *   1. the multi-tenant runtime — React hydrates it, `onClick` runs, real state
 *   2. the editor canvas        — hydrated too, but clicking is a no-op preview
 *   3. the static export        — `renderToStaticMarkup`, no bundle, no
 *                                 hydration. `onClick` is dead, and the
 *                                 artifact's own vanilla script binds to the
 *                                 `data-cms-add-to-cart` attributes below
 *
 * Those attributes are therefore not decoration: they are the contract between
 * this component and the export runtime. Keeping them on the same element that
 * owns the click handler is what stops the two paths drifting apart.
 */
import React from "react";
import { addToCart } from "./cart-store";

export interface AddToCartProps {
  siteId: string;
  variantId: string;
  title: string;
  priceCents: number;
  label: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  /** The editor canvas renders this inert — clicking a preview shouldn't buy anything. */
  preview?: boolean;
}

export function AddToCart({
  siteId,
  variantId,
  title,
  priceCents,
  label,
  disabled,
  style,
  preview,
}: AddToCartProps) {
  return (
    <button
      type="button"
      data-cms-add-to-cart={variantId}
      data-cms-title={title}
      data-cms-price={String(priceCents)}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        if (preview || disabled || !variantId) return;
        addToCart(siteId, { variantId, title, priceCents });
      }}
      style={style}
    >
      {label}
    </button>
  );
}
