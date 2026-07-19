"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Reduced motion is a hard requirement here, not a nicety: this page drives two
 * WebGL scenes off scroll position. globals.css zeroes CSS durations, but that
 * does nothing to a requestAnimationFrame loop — so every animated piece asks
 * this hook and renders its *end state* statically instead.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return reduced;
}

/**
 * How far a tall section has travelled through the viewport, 0 → 1.
 * 0 = its top just reached the top of the viewport, 1 = its bottom just left.
 * Deliberately a plain function, not a hook: the canvases call it inside their
 * own animation frame so scrolling never triggers a React render.
 */
export function scrollProgressOf(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const span = rect.height - window.innerHeight;
  if (span <= 0) return rect.top <= 0 ? 1 : 0;
  const p = -rect.top / span;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * Coarse scroll state for text that must swap. Returns the index of the current
 * band given ascending cut points; only re-renders when the band changes, so a
 * full page of scrolling costs a handful of renders instead of hundreds.
 * `cuts` must be a module-level constant (stable identity).
 */
export function useScrollPhase(
  ref: RefObject<HTMLElement | null>,
  cuts: readonly number[],
): number {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (reduced) {
      setPhase(cuts.length);
      return;
    }

    let frame = 0;
    let last = -1;

    const measure = () => {
      frame = 0;
      const p = scrollProgressOf(el);
      let idx = 0;
      for (const cut of cuts) if (p >= cut) idx++;
      if (idx !== last) {
        last = idx;
        setPhase(idx);
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref, cuts, reduced]);

  return phase;
}
