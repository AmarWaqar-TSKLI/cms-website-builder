"use client";

/**
 * Autosave — the entire network layer of the editor.
 *
 * A ticker every AUTOSAVE_MS checks whether the tree is dirty and, if so, PUTs
 * it. Interval rather than per-keystroke debounce because the guarantee we want
 * is "your work is at most two seconds old", not "we fire a request whenever you
 * pause".
 *
 * Each save OVERWRITES the same page_drafts row. Type for an hour and the table
 * still holds exactly one row for this page — that is the D2 split, and the
 * walkthrough shows the two counters side by side while you type.
 */
import { useEffect, useRef } from "react";
import { decomposeForSave, useEditor, type EditTarget } from "./store";

export const AUTOSAVE_MS = 2000;

/**
 * The only difference between editing a page and editing a shared component.
 * Same store, same canvas, same interval, same optimistic lock — one URL.
 */
export function draftEndpoint(target: EditTarget, id: string): string {
  return target === "component" ? `/api/components/${id}/draft` : `/api/pages/${id}/draft`;
}

export function useAutosave(enabled = true) {
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const save = async () => {
      const state = useEditor.getState();
      if (state.status !== "dirty" || inFlight.current || !state.pageId) return;

      // A conflict is terminal until the user reloads — retrying would just
      // clobber whatever the other tab wrote.
      if (state.status === "dirty" && useEditor.getState().lastError === "conflict") return;

      inFlight.current = true;
      useEditor.getState().setStatus("saving");

      try {
        const res = await fetch(draftEndpoint(state.target, state.pageId), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          // Decomposed, not the working tree: the page stores references, and each
      // component stores its own body. See decompose() for why they are inverses.
      body: JSON.stringify({ ...decomposeForSave(), lockVersion: state.lockVersion }),
        });

        if (res.status === 409) {
          const data = await res.json();
          useEditor
            .getState()
            .setStatus("conflict", data.message ?? "This was edited in another tab.");
          return;
        }
        if (!res.ok) {
          useEditor.getState().setStatus("failed", `Save failed (${res.status})`);
          return;
        }

        const data = await res.json();
        // Only settle to "saved" if nothing changed while the request was out.
        if (useEditor.getState().status === "saving") {
          useEditor.getState().markSaved(data.lockVersion);
        } else {
          useEditor.setState({ lockVersion: data.lockVersion });
        }
      } catch (err) {
        useEditor
          .getState()
          .setStatus("failed", err instanceof Error ? err.message : "Network error");
      } finally {
        inFlight.current = false;
      }
    };

    const timer = setInterval(save, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [enabled]);
}

/** Force a save right now — used before publishing so the snapshot is current. */
export async function flushDraft(): Promise<boolean> {
  const state = useEditor.getState();
  if (!state.pageId) return true;
  if (state.status === "conflict") return false;

  try {
    const res = await fetch(`/api/pages/${state.pageId}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // Decomposed, not the working tree: the page stores references, and each
      // component stores its own body. See decompose() for why they are inverses.
      body: JSON.stringify({ ...decomposeForSave(), lockVersion: state.lockVersion }),
    });
    if (res.status === 409) {
      useEditor.getState().setStatus("conflict", "This was edited in another tab.");
      return false;
    }
    if (!res.ok) return false;
    const data = await res.json();
    useEditor.getState().markSaved(data.lockVersion);
    return true;
  } catch {
    return false;
  }
}
