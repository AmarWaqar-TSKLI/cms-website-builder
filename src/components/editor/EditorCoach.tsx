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
        className="pointer-events-auto w-full max-w-lg border-2 border-coal bg-white p-5 shadow-[6px_6px_0_var(--color-coal)]"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="display text-[19px] leading-tight text-coal">
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
              <span className="shrink-0 font-[family-name:var(--font-display)] text-[22px] leading-none font-extrabold text-tomato">
                {m.n}
              </span>
              <span>
                <span className="block text-[13.5px] font-semibold text-coal">{m.t}</span>
                <span className="block text-[12.5px] leading-snug text-coal/70">{m.d}</span>
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={dismiss}
          className="btn-poster mt-4 w-full justify-center bg-tomato text-[14px] text-paper"
        >
          Got it — let&rsquo;s build
        </button>
      </div>
    </div>
  );
}
