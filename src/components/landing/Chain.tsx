"use client";

import type { ReactNode } from "react";

/** The number + label that opens every beat. */
export function Kicker({ n, label }: { n: string; label: string }) {
  return (
    <div className="mono-xs flex items-center gap-3 text-ink-500 uppercase">
      <span className="text-flux-400">{n}</span>
      <span className="h-px w-6 bg-ink-700" aria-hidden />
      <span className="tracking-[0.18em]">{label}</span>
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
