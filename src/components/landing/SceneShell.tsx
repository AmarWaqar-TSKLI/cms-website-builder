"use client";

import type { ReactNode } from "react";
import { Kicker } from "./Chain";

/**
 * The "therefore" that used to sit between beats now opens each scene. It cost
 * ~200px of dead scroll per link when it stood alone; as the first line of the
 * frame it costs nothing and reads better — every scene literally opens on the
 * reason it exists.
 */
export function SceneHead({
  n,
  label,
  therefore,
  title,
  children,
  className = "",
  tight = false,
}: {
  n: string;
  label: string;
  therefore?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
  tight?: boolean;
}) {
  return (
    <div className={className}>
      {therefore ? (
        <p className="mono-xs mb-6 flex max-w-2xl flex-wrap items-baseline gap-x-2.5 gap-y-1 leading-relaxed">
          <span className="shrink-0 tracking-[0.22em] text-ink-600 uppercase">therefore</span>
          <span className="min-w-0 text-ink-400">{therefore}</span>
        </p>
      ) : null}
      <Kicker n={n} label={label} />
      <h2
        className={[
          "mt-5 max-w-3xl leading-[1.08] font-semibold tracking-tight text-ink-100",
          tight ? "text-2xl sm:text-3xl md:text-[2.1rem]" : "text-3xl sm:text-4xl md:text-[2.6rem]",
        ].join(" ")}
      >
        {title}
      </h2>
      {children ? (
        <div
          className={[
            "max-w-2xl space-y-3.5 leading-relaxed text-ink-400",
            tight ? "mt-4 text-[14px]" : "mt-5 text-[15px]",
          ].join(" ")}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Wide diagrams keep their geometry on every viewport and scroll *inside their
 * own box* on narrow ones. The body must never scroll sideways; a diagram that
 * reflows into unreadable 4px type is not an improvement over one you swipe.
 */
export function Diagram({
  children,
  minWidth = 640,
  className = "",
}: {
  children: ReactNode;
  minWidth?: number;
  className?: string;
}) {
  return (
    <div className={`-mx-6 overflow-x-auto px-6 ${className}`}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

/** A section that plays as it passes through the viewport. */
export function FlowScene({
  beat,
  innerRef,
  children,
  className = "",
}: {
  beat: string;
  innerRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      ref={innerRef}
      data-beat={beat}
      className={`relative mx-auto w-full max-w-5xl px-6 py-12 sm:py-14 ${className}`}
    >
      {children}
    </section>
  );
}
