"use client";

import { useRef } from "react";
import HeroCanvas from "./HeroCanvas";

/**
 * Two viewports tall: the first screen is the headline over scattered nodes,
 * and the act of scrolling the second screen resolves them into the tree.
 * Under prefers-reduced-motion the section collapses to one screen and the
 * canvas paints the resolved tree immediately.
 */
export default function Hero() {
  const sectionRef = useRef<HTMLElement | null>(null);

  return (
    <section ref={sectionRef} className="relative h-[200vh] motion-reduce:h-auto">
      <div className="sticky top-0 flex h-screen flex-col justify-between overflow-hidden motion-reduce:static motion-reduce:h-auto motion-reduce:min-h-screen">
        <HeroCanvas sectionRef={sectionRef} />

        {/* Keeps the headline legible wherever a node happens to land. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950/85 via-ink-950/25 to-ink-950"
        />

        <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-6 pt-8">
          <span className="mono-xs tracking-[0.2em] text-ink-400 uppercase">
            CMS <span className="text-ink-600">/</span> website builder
          </span>
          <span className="mono-xs hidden text-ink-500 sm:inline">architecture demo</span>
        </header>

        <div className="relative mx-auto w-full max-w-5xl px-6 pb-16 sm:pb-24">
          <h1 className="max-w-3xl text-[clamp(2.25rem,7vw,4.5rem)] leading-[0.98] font-semibold tracking-tight text-ink-100">
            A page is a description,
            <br />
            <span className="text-ink-400">not a document.</span>
          </h1>

          <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-ink-400 sm:text-base">
            Eight decisions, each one forced by the one before it. It starts with a single refusal:
            a site should not be trapped on the server that built it.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="mono-xs flex items-center gap-2 text-ink-500">
              <span className="h-1.5 w-1.5 rounded-full bg-flux-500" aria-hidden />
              {"{ type, props, children }"}
            </span>
            <span className="mono-xs flex items-center gap-2 text-ink-500">
              <span className="h-1.5 w-1.5 rounded-full bg-live-500" aria-hidden />
              append-only releases
            </span>
            <span className="mono-xs flex items-center gap-2 text-ink-500">
              <span className="h-1.5 w-1.5 rounded-full bg-ink-500" aria-hidden />
              rollback = 1 column
            </span>
          </div>

          <p className="mono-xs mt-12 text-ink-600 motion-reduce:hidden">
            scroll — the constellation resolves
          </p>
        </div>
      </div>
    </section>
  );
}
