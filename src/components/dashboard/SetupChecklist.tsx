"use client";

/**
 * The first-site setup guide.
 *
 * A new person does not need the full dashboard — they need to know what to do
 * first, second, third. This is that: a short, ordered checklist that reads the
 * site's ACTUAL state (has a page been edited, is there a product, has it been
 * published) and points at exactly one live action — the first thing not yet
 * done.
 *
 * It is deliberately temporary. The moment every step is done it stops rendering
 * and the ongoing "what's next" card (NextStep) takes over. A checklist that
 * lingers after you have finished it is the same furniture problem NextStep was
 * written to avoid — so completion (or an explicit "hide") retires it for good.
 *
 * This component only draws; the parent computes each step's `done` from data it
 * already has, and passes the publish action in as `onClick`. Keeping the facts
 * in one place is why there is no second source of truth about site state here.
 */
import Link from "next/link";

export interface SetupStep {
  id: string;
  title: string;
  blurb: string;
  done: boolean;
  /** Label for the action button, shown only on the current (first-undone) step. */
  cta: string;
  /** A link step, or an action step (onClick). Exactly one is set. */
  href?: string;
  onClick?: () => void;
}

export function SetupChecklist({
  steps,
  onDismiss,
  publishing,
}: {
  steps: SetupStep[];
  onDismiss: () => void;
  publishing?: boolean;
}) {
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  // The one live action: the first step still to do.
  const currentIndex = steps.findIndex((s) => !s.done);
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-flux-500/25 bg-flux-500/[0.05] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-flux-300">
            Get your site ready
          </p>
          <h2 className="display mt-2 text-[20px] text-ink-100">
            {doneCount === 0
              ? "Three quick steps to your first live website"
              : `You’re ${doneCount} of ${total} of the way there`}
          </h2>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md px-2 py-1 text-[12px] text-ink-500 transition-colors hover:text-ink-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400"
          title="Hide this guide. You can always publish from the panel below."
        >
          Hide
        </button>
      </div>

      {/* Progress. A plain bar, because a person should be able to see how far
          along they are without reading anything. */}
      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800"
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${doneCount} of ${total} setup steps done`}
        >
          <div
            className="h-full rounded-full bg-flux-500 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-[11.5px] font-medium text-ink-400">
          {doneCount}/{total}
        </span>
      </div>

      <ol className="mt-5 space-y-2.5">
        {steps.map((step, i) => {
          const isCurrent = i === currentIndex;
          return (
            <li
              key={step.id}
              className={
                "flex items-start gap-3.5 rounded-xl border px-3.5 py-3 transition-colors " +
                (step.done
                  ? "border-live-500/25 bg-live-500/[0.04]"
                  : isCurrent
                    ? "border-flux-500/40 bg-flux-500/[0.06]"
                    : "border-ink-800 bg-ink-950/50")
              }
            >
              <span
                aria-hidden
                className={
                  "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold " +
                  (step.done
                    ? "bg-live-500/15 text-live-500"
                    : isCurrent
                      ? "bg-flux-500 text-white"
                      : "border border-ink-700 text-ink-500")
                }
              >
                {step.done ? "✓" : i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={
                    "text-[13.5px] font-medium " +
                    (step.done ? "text-ink-400 line-through decoration-ink-600" : "text-ink-100")
                  }
                >
                  {step.title}
                </p>
                {!step.done && (
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-400">{step.blurb}</p>
                )}

                {isCurrent &&
                  (step.href ? (
                    <Link
                      href={step.href}
                      className="mt-3 inline-flex rounded-xl bg-flux-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-flux-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400"
                    >
                      {step.cta}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={step.onClick}
                      disabled={publishing}
                      className="mt-3 inline-flex rounded-xl bg-flux-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400"
                    >
                      {publishing ? "Publishing…" : step.cta}
                    </button>
                  ))}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
