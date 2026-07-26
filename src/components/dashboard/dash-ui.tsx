"use client";

/**
 * Small presentational kit for the dashboard.
 *
 * Rule of the house: the primary text on anything is plain English. Table and
 * column names are welcome, but only as secondary detail — a muted caption, a
 * `title` tooltip, or inside the "What's happening underneath?" disclosure.
 */
import { type ReactNode } from "react";
import Link from "next/link";
import { cx } from "../ui";
// Technical-details now lives in a shared module so the editor can read the same
// switch. Re-exported here so every existing dashboard import keeps working.
import { TechnicalDetails, useTechnical } from "../technical";

export { TechnicalDetails, useTechnical };

/* ── buttons ──────────────────────────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "quiet" | "danger";
type Size = "md" | "sm" | "xs";

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-flux-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-flux-500 text-white shadow-[0_1px_0_0_rgba(255,255,255,0.14)_inset] hover:bg-flux-400 active:bg-flux-500",
  secondary:
    "border border-ink-600 bg-ink-800/70 text-ink-100 hover:border-ink-500 hover:bg-ink-800",
  ghost: "border border-ink-700 text-ink-300 hover:border-ink-500 hover:text-ink-100",
  quiet: "text-ink-400 hover:text-ink-100 hover:bg-ink-800/70",
  danger: "bg-warn-500 text-ink-950 font-semibold hover:bg-warn-500/90",
};

const SIZE: Record<Size, string> = {
  md: "h-10 px-4 text-[13px] rounded-xl",
  sm: "h-8 px-3 text-[12px] rounded-lg",
  xs: "h-7 px-2.5 text-[11px] rounded-lg",
};

export function btn(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cx(
    "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium",
    "transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px",
    "disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0",
    VARIANT[variant],
    SIZE[size],
    FOCUS,
    className,
  );
}

export function Btn({
  variant,
  size,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button type="button" className={btn(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function LinkBtn({
  href,
  variant,
  size,
  className,
  external,
  download,
  children,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  external?: boolean;
  download?: boolean;
  children: ReactNode;
  title?: string;
}) {
  const cls = btn(variant, size, className);
  if (external || download) {
    return (
      <a
        href={href}
        className={cls}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        {...rest}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}

/* ── panels ───────────────────────────────────────────────────────────────── */

export function Card({
  className,
  children,
  tone = "default",
}: {
  className?: string;
  children: ReactNode;
  tone?: "default" | "live";
}) {
  return (
    <section
      className={cx(
        "rounded-2xl border bg-ink-900 shadow-[0_1px_2px_rgba(17,24,32,0.04)]",
        tone === "live" ? "border-live-500/30" : "border-ink-800",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * Panel header: plain-English title first, optional one-line explanation, and
 * the underlying tables as a small muted caption that never labels a control.
 */
export function CardHead({
  title,
  hint,
  tables,
  action,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  /** Shown only when technical details are switched on. */
  tables?: string;
  action?: ReactNode;
  className?: string;
}) {
  const technical = useTechnical();
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 className="display text-[17px] text-ink-100">{title}</h2>
        {hint && <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-ink-400">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {technical && tables && (
          <code
            title={`Stored in the ${tables} table${tables.includes("·") ? "s" : ""}`}
            className="hidden rounded-md bg-ink-850 px-2 py-1 font-mono text-[10.5px] tracking-tight text-ink-500 sm:block"
          >
            {tables}
          </code>
        )}
        {action}
      </div>
    </div>
  );
}

/* ── stats ────────────────────────────────────────────────────────────────── */

export function Tile({
  label,
  value,
  sub,
  href,
  title,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  href?: string;
  title?: string;
}) {
  const inner = (
    <>
      <div className="text-[22px] font-semibold leading-none tracking-tight text-ink-100">
        {value}
      </div>
      <div className="mt-1.5 text-[12px] font-medium text-ink-300">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-500">{sub}</div>}
    </>
  );
  const cls =
    "block rounded-xl border border-ink-800 bg-ink-950/70 px-4 py-3.5 transition-colors";
  if (href) {
    return (
      <Link
        href={href}
        title={title}
        className={cx(cls, "hover:border-flux-500/40 hover:bg-ink-900/60", FOCUS)}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className={cls} title={title}>
      {inner}
    </div>
  );
}

/* ── the escape hatch for everything technical ───────────────────────────── */

export function UnderTheHood({
  summary = "How this works underneath",
  children,
}: {
  summary?: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-ink-800 bg-ink-900/40 open:bg-ink-900/70">
      <summary
        className={cx(
          "flex cursor-pointer list-none items-center gap-2 rounded-2xl px-5 py-3.5 text-[12.5px] text-ink-400",
          "transition-colors hover:text-ink-100",
          FOCUS,
        )}
      >
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className="h-3 w-3 shrink-0 text-ink-500 transition-transform duration-200 group-open:rotate-90"
        >
          <path d="M4 2.5 8 6l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {summary}
      </summary>
      <div className="max-w-[76ch] space-y-2.5 border-t border-ink-800 px-5 py-4 text-[12.5px] leading-relaxed text-ink-400">
        {children}
      </div>
    </details>
  );
}

/* ── time ─────────────────────────────────────────────────────────────────── */

export function relativeTime(input: string | Date | null | undefined): string {
  if (!input) return "";
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 10) return "just now";
  if (secs < 90) return `${Math.max(secs, 10)} seconds ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(input).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function exactTime(input: string | Date | null | undefined): string {
  if (!input) return "";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
