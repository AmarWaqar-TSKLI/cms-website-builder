"use client";

/**
 * Landing-page motion primitives, kept tiny and dependency-free.
 *
 *  <Reveal>  — fades + lifts its children in the first time they scroll into
 *              view. One IntersectionObserver per element, disconnected once it
 *              has fired, so nothing keeps running as you scroll.
 *
 *  useParallax — a ref + CSS custom properties (--mx, --my, -1..1) driven by the
 *              pointer, rAF-throttled. Children read them to drift by their own
 *              depth. Pointer-only, so it costs nothing on touch.
 *
 * Both no-op under prefers-reduced-motion: the reveal shows immediately and the
 * parallax never binds. Motion is a garnish here, never load-bearing.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "span" | "li" | "section" | "header";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Comp = Tag as "div";
  return (
    <Comp
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`lp-reveal ${shown ? "is-in" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Comp>
  );
}

/** Attach to a container; its descendants read --mx / --my to drift with the pointer. */
export function useParallax<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const mx = (e.clientX - r.left) / r.width - 0.5;
        const my = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty("--mx", mx.toFixed(3));
        el.style.setProperty("--my", my.toFixed(3));
      });
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      el.style.setProperty("--mx", "0");
      el.style.setProperty("--my", "0");
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", reset);
    };
  }, []);

  return ref;
}
