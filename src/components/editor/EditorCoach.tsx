"use client";

/**
 * A one-time "here's the whole editor" card for a first-timer.
 *
 * Deliberately unobtrusive and impossible to get stuck behind: the wrapper is
 * pointer-events-none so it never blocks a click on the canvas or palette, and it
 * clears itself the moment the person interacts with anything (or presses "Got
 * it"). Shown once per browser. Because it can't intercept input, it also can't
 * trip the end-to-end suite.
 */
import { useEffect, useRef, useState } from "react";

const KEY = "cms.editor-coached";

const MOVES = [
  { n: "1", t: "Add a block", d: "Drag one in from the left — or just click it." },
  { n: "2", t: "Change a block", d: "Click it, then use its toolbar: move, duplicate, reuse, delete." },
  { n: "3", t: "Edit words", d: "Double-click any text on the page and type." },
  { n: "4", t: "Go live", d: "Press Publish, top-right, when it looks right." },
];

export function EditorCoach() {
  const [show, setShow] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(KEY) !== "1") setShow(true);
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* private mode — showing it again is harmless */
    }
    setShow(false);
  };

  // The moment the person touches anything outside the card, they've moved on —
  // clear it. Capture phase so it fires before the target's own handler, and we
  // never stop the event, so their click still lands where they aimed.
  useEffect(() => {
    if (!show) return;
    const onDown = (e: Event) => {
      if (cardRef.current?.contains(e.target as Node)) return;
      dismiss();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [show]);

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div
        ref={cardRef}
        className="pointer-events-auto w-full max-w-lg rounded-2xl border border-flux-500/30 bg-ink-900 p-4 shadow-2xl shadow-black/20"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[14px] font-semibold text-ink-100">
            First time here? The whole editor, in four moves
          </p>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded-md px-1 text-ink-500 transition-colors hover:text-ink-200"
          >
            ✕
          </button>
        </div>
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {MOVES.map((m) => (
            <li key={m.n} className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-flux-500 text-[11px] font-semibold text-white">
                {m.n}
              </span>
              <span>
                <span className="block text-[12.5px] font-medium text-ink-100">{m.t}</span>
                <span className="block text-[11.5px] leading-snug text-ink-400">{m.d}</span>
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 w-full rounded-xl bg-flux-500 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-flux-400"
        >
          Got it — let&rsquo;s build
        </button>
      </div>
    </div>
  );
}
