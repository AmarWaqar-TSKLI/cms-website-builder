"use client";

import { Ago } from "./Ago";
import type { DashActivity } from "./DashboardShell";

/**
 * Who did what, most recent first.
 *
 * Every line is read straight out of `activity_log` — the summary was written as
 * a finished sentence at the moment it happened and is never re-derived. That is
 * why an entry still reads correctly after the page it mentions is renamed, or
 * the person who did it has left.
 *
 * The table is append-only at the database level. Nothing in the product can
 * edit or delete a line here, which is the only property that makes an audit
 * trail worth reading.
 */
const TONE: Record<string, { dot: string; label: string }> = {
  "site.published": { dot: "bg-live-500", label: "Published" },
  "site.rolled_back": { dot: "bg-warn-500", label: "Rolled back" },
  "page.edited": { dot: "bg-flux-400", label: "Edited" },
  "component.created": { dot: "bg-[#22c7a9]", label: "Component" },
  "component.renamed": { dot: "bg-[#22c7a9]", label: "Component" },
  "component.deleted": { dot: "bg-fail-500", label: "Component" },
  "user.signed_in": { dot: "bg-ink-600", label: "Signed in" },
  "user.signed_out": { dot: "bg-ink-600", label: "Signed out" },
};

export function ActivityFeed({ activity }: { activity: DashActivity[] }) {
  if (activity.length === 0) {
    return (
      <p className="px-1 py-6 text-[12.5px] leading-relaxed text-ink-500">
        Nothing has happened yet. Edit a page or publish and it shows up here — who, what, and when.
      </p>
    );
  }

  return (
    <ol className="space-y-0.5">
      {activity.map((entry) => {
        const tone = TONE[entry.action] ?? { dot: "bg-ink-600", label: "" };
        return (
          <li
            key={entry.id}
            className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-ink-850/60"
          >
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] leading-snug text-ink-200">{entry.summary}</span>
              <span className="mt-0.5 block text-[11px] text-ink-500">
                <Ago at={entry.createdAt} fallback="just now" />
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
