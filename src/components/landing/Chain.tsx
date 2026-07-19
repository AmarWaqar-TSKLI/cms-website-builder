"use client";

import type { ReactNode } from "react";
import { useInView } from "./hooks";

/** Fade + rise on first entry. Reduced motion is handled by globals.css zeroing
 *  the transition duration — the element still ends up visible either way. */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={[
        "transition-[opacity,transform] duration-700 ease-out will-change-[opacity,transform]",
        inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function Kicker({ n, label }: { n: string; label: string }) {
  return (
    <div className="mono-xs flex items-center gap-3 text-ink-500 uppercase">
      <span className="text-flux-400">{n}</span>
      <span className="h-px w-6 bg-ink-700" aria-hidden />
      <span className="tracking-[0.18em]">{label}</span>
    </div>
  );
}

/** One link in the argument. */
export function Beat({
  n,
  label,
  title,
  children,
  aside,
}: {
  n: string;
  label: string;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-5xl px-6">
      <Reveal>
        <Kicker n={n} label={label} />
        <h2 className="mt-6 max-w-3xl text-3xl leading-[1.08] font-semibold tracking-tight text-ink-100 sm:text-4xl md:text-5xl">
          {title}
        </h2>
        {children ? (
          <div className="mt-6 max-w-2xl space-y-4 text-[15px] leading-relaxed text-ink-400 sm:text-base">
            {children}
          </div>
        ) : null}
      </Reveal>
      {aside ? (
        <Reveal delay={120} className="mt-10">
          {aside}
        </Reveal>
      ) : null}
    </section>
  );
}

/** The connective tissue. Each beat is *forced* by the one above it. */
export function Therefore({ children }: { children?: ReactNode }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
      <div className="flex items-start gap-4">
        <div className="flex w-6 shrink-0 justify-center pt-1">
          <span
            aria-hidden
            className={[
              "block w-px origin-top bg-gradient-to-b from-flux-500/70 to-ink-700",
              "transition-transform duration-700 ease-out",
              inView ? "scale-y-100" : "scale-y-0",
            ].join(" ")}
            style={{ height: 56 }}
          />
        </div>
        <div
          className={[
            "-mt-1 transition-opacity duration-700 ease-out",
            inView ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          <span className="mono-xs tracking-[0.22em] text-ink-500 uppercase">therefore</span>
          {children ? (
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-300">{children}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-[0.85em] text-ink-200">
      {children}
    </code>
  );
}
