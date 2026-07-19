"use client";

import { useEffect, useRef, type RefObject } from "react";
import { scrollProgressOf, usePrefersReducedMotion } from "./hooks";

/* --------------------------------------------------------------- math bits */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 0 before `from`, 1 after `to`, linear between. The unit of this whole file. */
export const band = (p: number, from: number, to: number) =>
  clamp01(to === from ? (p >= to ? 1 : 0) : (p - from) / (to - from));

export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeInOut = (t: number) => {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
};
/** Out and back: 0 at both ends, 1 in the middle. Used for anything that strains. */
export const arc = (t: number) => Math.sin(clamp01(t) * Math.PI);

/* ------------------------------------------------------------------ colour */

/** The design tokens, as literals, because SVG attributes cannot read Tailwind. */
export const C = {
  ink950: "#08080a",
  ink900: "#0d0d11",
  ink850: "#121217",
  ink800: "#17171d",
  ink700: "#212129",
  ink600: "#2e2e39",
  ink500: "#454553",
  ink400: "#6e6e80",
  ink300: "#9a9aad",
  ink200: "#c8c8d4",
  ink100: "#e8e8ef",
  flux500: "#6d5cff",
  flux400: "#8b7cff",
  flux300: "#a89dff",
  live: "#12b981",
  warn: "#f0a83c",
  fail: "#f2555a",
} as const;

const channels = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const u = clamp01(t);
  return `rgb(${Math.round(lerp(ar, br, u))},${Math.round(lerp(ag, bg, u))},${Math.round(
    lerp(ab, bb, u),
  )})`;
}

/* ---------------------------------------------------------------- progress */

// An in-flow (non-sticky) scene is "playing" from the moment its top crosses
// 95% of the viewport until its bottom passes 25%. That window is longer than
// the element itself, which is the point: a 78vh section gets ~1.5 viewports of
// scroll travel while only costing 78vh of page height. Sticky scenes cost the
// full travel, so only the two beats that need a held frame use them.
const FLOW_TOP = 0.95;
const FLOW_BOTTOM = 0.25;

export function flowProgressOf(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || 1;
  const top0 = FLOW_TOP * vh;
  const top1 = FLOW_BOTTOM * vh - r.height;
  const span = top0 - top1;
  if (span <= 0) return 1;
  return clamp01((top0 - r.top) / span);
}

/* ------------------------------------------------------------------ driver */

/**
 * One rAF loop per scene, feeding a `draw(progress)` that mutates the DOM
 * directly. React never re-renders while scrolling — that is the whole reason
 * this exists instead of a state hook.
 *
 * - `prefers-reduced-motion` skips the loop entirely and paints `draw(1, true)`,
 *   so every scene has to be authored with a meaningful end state.
 * - An IntersectionObserver stops the loop while the scene is off-screen.
 */
export function useScrollFrame(
  ref: RefObject<HTMLElement | null>,
  draw: (p: number, reduced: boolean) => void,
  /** `auto` measures per frame: tall enough to pin → sticky maths, otherwise
   *  flow maths. It is what lets a scene be sticky at lg and in-flow on a phone
   *  without a second code path. */
  mode: "flow" | "sticky" | "auto" = "flow",
): boolean {
  const reduced = usePrefersReducedMotion();
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (reduced) {
      const paint = () => drawRef.current(1, true);
      paint();
      // Fonts and images can change layout once after mount.
      const settle = window.setTimeout(paint, 80);
      window.addEventListener("resize", paint);
      return () => {
        window.clearTimeout(settle);
        window.removeEventListener("resize", paint);
      };
    }

    const progress = () => {
      if (mode === "sticky") return scrollProgressOf(el);
      if (mode === "flow") return flowProgressOf(el);
      const pinned = el.getBoundingClientRect().height - (window.innerHeight || 0) > 40;
      return pinned ? scrollProgressOf(el) : flowProgressOf(el);
    };

    let raf = 0;
    let visible = true;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      drawRef.current(progress(), false);
    };
    const start = () => {
      if (!raf && visible) raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    // Paint once immediately so a scene that is scrolled past on load (or that
    // never becomes visible) is never left in its unpainted, blank state.
    drawRef.current(progress(), false);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          visible = entries.some((e) => e.isIntersecting);
          if (visible) start();
          else stop();
        },
        { threshold: 0, rootMargin: "20% 0px 20% 0px" },
      );
      io.observe(el);
    } else {
      start();
    }

    return () => {
      stop();
      io?.disconnect();
    };
  }, [ref, mode, reduced]);

  return reduced;
}

/* --------------------------------------------------------------- DOM utils */

/** Set an element's opacity + Y offset in one go. Null-safe by design: every
 *  caller is a ref that may not have mounted yet. */
export function reveal(
  el: HTMLElement | SVGElement | null,
  t: number,
  rise = 14,
  extra = "",
): void {
  if (!el) return;
  const e = easeOut(t);
  el.style.opacity = String(e);
  el.style.transform = `translate3d(0, ${((1 - e) * rise).toFixed(2)}px, 0)${extra}`;
}

/** Draw a path in, 0 → 1, using its own measured length. */
export function drawPath(path: SVGPathElement | SVGLineElement | null, t: number): void {
  if (!path) return;
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  path.style.strokeDashoffset = `${len * (1 - clamp01(t))}`;
}
