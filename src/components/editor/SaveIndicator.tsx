"use client";

import { useEditor } from "@/lib/editor/store";
import { Dot } from "../ui";

/**
 * Saving / Saved / Failed — plus the thing that actually matters: a count of
 * how many times this one row has been overwritten.
 */
export function SaveIndicator() {
  const status = useEditor((s) => s.status);
  const saveCount = useEditor((s) => s.saveCount);
  const lastError = useEditor((s) => s.lastError);

  if (status === "conflict") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-warn-500/40 bg-warn-500/10 px-3 py-1.5">
        <Dot tone="warn" />
        <div>
          <div className="text-[12px] font-medium text-warn-500">Edited in another tab</div>
          <div className="text-[11px] text-ink-400">
            lock_version moved on — reload to pick up their changes.
          </div>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-fail-500/40 bg-fail-500/10 px-3 py-1.5">
        <Dot tone="failed" />
        <span className="text-[12px] text-fail-500">{lastError ?? "Save failed"}</span>
      </div>
    );
  }

  const label =
    status === "saving"
      ? "Saving…"
      : status === "dirty"
        ? "Unsaved changes"
        : status === "saved"
          ? "Saved"
          : "Up to date";

  return (
    <div className="flex items-center gap-2 px-1">
      <Dot tone={status === "saving" ? "building" : status === "dirty" ? "warn" : "live"} pulse={status === "saving"} />
      <span className="text-[12px] text-ink-300">{label}</span>
      {saveCount > 0 && (
        <span
          className="font-mono text-[11px] text-ink-500"
          title="Every one of these overwrote the same page_drafts row."
        >
          · {saveCount} autosave{saveCount === 1 ? "" : "s"} → 1 row
        </span>
      )}
    </div>
  );
}
