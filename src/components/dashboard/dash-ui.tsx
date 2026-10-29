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

// The landing's poster button, scaled for a working screen: a solid block on a
// hard ink shadow that lifts on hover and presses flat when clicked.
const POSTER =
  "border-2 border-coal shadow-[3px_3px_0_var(--color-coal)] transition-[transform,box-shadow] duration-100 hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_var(--color-coal)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_var(--color-coal)]";

const VARIANT: Record<Variant, string> = {
  primary: `${POSTER} bg-tomato text-paper`,
  secondary: `${POSTER} bg-white text-coal`,
  ghost: "border-2 border-coal/25 text-coal hover:border-coal transition-colors",
  quiet: "text-ink-400 hover:text-coal hover:bg-ink-850 transition-colors",
  danger: "border-2 border-fail-500 text-fail-500 hover:bg-fail-500 hover:text-white transition-colors",
};

const SIZE: Record<Size, string> = {
  md: "h-9 px-4 text-[13.5px]",
  sm: "h-8 px-3 text-[12.5px]",
  xs: "h-7 px-2.5 text-[11.5px]",
};

export function btn(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cx(
    "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-semibold",
    "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-none",
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
        "border-2 bg-white",
        tone === "live" ? "border-live-500" : "border-coal",
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
        <h2 className="display text-[21px] text-coal">{title}</h2>
        {hint && <p className="mt-1 max-w-prose text-[13.5px] leading-relaxed text-coal/70">{hint}</p>}
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
      <div className="display text-[32px] leading-none text-coal" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div className="kicker mt-2 text-[11px] text-coal/70">{label}</div>
      {sub && <div className="mt-0.5 text-[12px] text-coal/55">{sub}</div>}
    </>
  );
  const cls = "block border-2 border-coal bg-paper px-4 py-4";
  if (href) {
    return (
      <Link
        href={href}
        title={title}
        className={cx(cls, "transition-colors hover:bg-sun", FOCUS)}
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
    <details className="group border-2 border-coal bg-paper open:bg-white">
      <summary
        className={cx(
          "flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-[13.5px] font-semibold text-coal",
          "transition-colors hover:text-tomato",
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
      <div className="max-w-[76ch] space-y-2.5 border-t-2 border-coal px-5 py-4 text-[13px] leading-relaxed text-coal/75">
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
