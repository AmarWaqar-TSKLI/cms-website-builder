"use client";

/**
 * The cart, as a real client-side store.
 *
 * This is the runtime's half of D8: a page whose HTML is a pure function of an
 * immutable release still has a working cart, because the cart was never part of
 * the page. It is client state plus one API call.
 *
 * Deliberately not Zustand or Context. A module-level store read through
 * `useSyncExternalStore` works no matter where a component sits in the tree,
 * which matters here because add-to-cart buttons are rendered from inside the
 * component registry — arbitrarily deep, and with no provider above them that
 * the registry could know about.
 *
 * It also renders correctly under `renderToStaticMarkup`, which the export path
 * uses outside React DOM entirely: `getServerSnapshot` returns the empty cart, so
 * the exported HTML ships with a collapsed cart bar exactly as before.
 */
import { useSyncExternalStore } from "react";

export interface CartLine {
  variantId: string;
  title: string;
  priceCents: number;
  qty: number;
}

/** Same localStorage key the exported artifact's vanilla script uses. */
const keyFor = (siteId: string) => `cms.cart.${siteId}`;

const EMPTY: CartLine[] = [];

let state: Record<string, CartLine[]> = {};
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load(siteId: string): CartLine[] {
  if (state[siteId]) return state[siteId];
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(keyFor(siteId));
    state = { ...state, [siteId]: raw ? (JSON.parse(raw) as CartLine[]) : EMPTY };
  } catch {
    state = { ...state, [siteId]: EMPTY };
  }
  return state[siteId];
}

function save(siteId: string, lines: CartLine[]) {
  state = { ...state, [siteId]: lines };
  try {
    window.localStorage.setItem(keyFor(siteId), JSON.stringify(lines));
  } catch {
    /* private mode — the cart still works for this page view */
  }
  emit();
}

export function addToCart(siteId: string, line: Omit<CartLine, "qty">) {
  const lines = [...load(siteId)];
  const existing = lines.findIndex((l) => l.variantId === line.variantId);
  if (existing >= 0) lines[existing] = { ...lines[existing], qty: lines[existing].qty + 1 };
  else lines.push({ ...line, qty: 1 });
  save(siteId, lines);
}

export function clearCart(siteId: string) {
  save(siteId, EMPTY);
}

export function useCart(siteId: string): CartLine[] {
  return useSyncExternalStore(
    subscribe,
    () => load(siteId),
    // Server render (and renderToStaticMarkup for the export) always starts empty.
    () => EMPTY,
  );
}

export const countOf = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty, 0);
export const totalOf = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty * l.priceCents, 0);
export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
