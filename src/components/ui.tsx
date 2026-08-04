import type { ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-xl border border-ink-800 bg-ink-900", className)}>{children}</div>
  );
}

const TONES = {
  neutral: "border-ink-600 bg-ink-850 text-ink-300",
  live: "border-live-500 bg-live-500/12 text-live-500",
  building: "border-flux-500 bg-flux-500/12 text-flux-300",
  failed: "border-fail-500 bg-fail-500/12 text-fail-500",
  warn: "border-warn-500 bg-warn-500/12 text-warn-500",
  accent: "border-flux-500 bg-flux-500/12 text-flux-300",
} as const;

/** Sticker-style status chip: solid border, loud caps, wiggles on hover. */
export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "sticker inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse }: { tone?: keyof typeof TONES; pulse?: boolean }) {
  const color =
    tone === "live"
      ? "bg-live-500"
      : tone === "failed"
        ? "bg-fail-500"
        : tone === "warn"
          ? "bg-warn-500"
          : tone === "building" || tone === "accent"
            ? "bg-flux-400"
            : "bg-ink-400";
  return (
    <span className="relative flex h-1.5 w-1.5">
      {pulse && (
        <span className={cx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-70", color)} />
      )}
      <span className={cx("relative inline-flex h-1.5 w-1.5 rounded-full", color)} />
    </span>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cx("font-mono text-[11px] tracking-tight", className)}>{children}</code>;
}

/**
 * The little explanatory notes threaded through the UI. The demo's job is to
 * make the architecture visible, so the interface says what it is doing and why.
 */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("text-[12px] leading-relaxed text-ink-400", className)}>{children}</p>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
      {children}
    </div>
  );
}
