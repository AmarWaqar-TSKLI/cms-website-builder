"use client";

import Link from "next/link";

/**
 * What to do next — one thing, chosen from the site's actual state.
 *
 * A dashboard full of equally-weighted panels is a dashboard that answers
 * "what should I do?" with "you decide". Somebody who has never built a website
 * does not know whether to edit, publish, or look at the store, and a row of
 * neutral cards gives them no help at all.
 *
 * So the state decides, and only one thing is ever suggested:
 *
 *   nothing published  → publish, and explain what that word means here
 *   unpublished edits  → publish them, and say how many pages are waiting
 *   everything live    → no suggestion at all
 *
 * That last case matters as much as the others. A prompt that never goes away
 * stops being a prompt and becomes furniture — if there is nothing to do, this
 * component renders a quiet confirmation instead of inventing a task.
 */
export function NextStep({
  state,
  pageCount,
  pendingCount,
  editHref,
  onPublish,
  publishing,
}: {
  state: "never-published" | "has-changes" | "up-to-date" | "building";
  pageCount: number;
  pendingCount: number;
  editHref: string;
  onPublish: () => void;
  publishing: boolean;
}) {
  if (state === "building") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-flux-500/25 bg-flux-500/[0.06] px-5 py-4">
        <span className="h-2 w-2 animate-pulse rounded-full bg-flux-500" />
        <p className="text-[13.5px] text-ink-300">
          <strong className="font-semibold text-ink-100">Putting your site online.</strong> This
          takes a few seconds. You can keep working — nothing you do now affects what visitors see
          until you publish again.
        </p>
      </div>
    );
  }

  if (state === "up-to-date") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-live-500/25 bg-live-500/[0.05] px-5 py-4">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-live-500/15 text-[12px] text-live-500">
          ✓
        </span>
        <p className="text-[13.5px] text-ink-300">
          <strong className="font-semibold text-ink-100">Everything is published.</strong> What you
          see in the editor is exactly what visitors see. Make a change whenever you like — it stays
          private until you publish it.
        </p>
      </div>
    );
  }

  const firstTime = state === "never-published";

  return (
    <div className="rounded-2xl border border-flux-500/25 bg-flux-500/[0.05] p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-flux-300">
        {firstTime ? "Start here" : "Next step"}
      </p>

      <h2 className="display mt-2 text-[20px] text-ink-100">
        {firstTime
          ? "Put your website online"
          : `You have changes on ${pendingCount} ${pendingCount === 1 ? "page" : "pages"} that nobody can see yet`}
      </h2>

      <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-ink-300">
        {firstTime ? (
          <>
            Your {pageCount === 1 ? "page is" : `${pageCount} pages are`} ready but private. Publishing
            gives your site a real web address and saves this exact version, so you can always come
            back to it.
          </>
        ) : (
          <>
            Editing never changes your live site. Publish when you are happy, and this version is
            saved so you can return to it if you change your mind.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing}
          className="rounded-xl bg-flux-500 px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {publishing ? "Publishing…" : firstTime ? "Publish my website" : "Publish my changes"}
        </button>
        <Link
          href={editHref}
          className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-2.5 text-[13.5px] font-medium text-ink-200 transition-colors hover:border-ink-600"
        >
          Keep editing first
        </Link>
      </div>
    </div>
  );
}
