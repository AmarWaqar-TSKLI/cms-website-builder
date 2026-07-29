"use client";

/**
 * An in-app replacement for window.prompt — styled, keyboard-friendly, and able
 * to show an inline error so a rejected name (taken, empty) is corrected in place
 * rather than answered with a second native alert.
 *
 * Used through the `usePromptDialog` hook, which hands back an async `ask()` that
 * resolves to the typed string (or null if cancelled) — a drop-in for the shape
 * `const name = window.prompt(...)` had, so callers keep reading top-to-bottom.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface PromptOptions {
  title: string;
  helpText?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  /** Shown in red under the field — for a rejected previous attempt. */
  error?: string;
}

export function usePromptDialog() {
  const [state, setState] = useState<{
    opts: PromptOptions;
    resolve: (value: string | null) => void;
  } | null>(null);

  const ask = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => setState({ opts, resolve })),
    [],
  );

  const dialog = state ? (
    <PromptDialog
      opts={state.opts}
      onDone={(value) => {
        const { resolve } = state;
        setState(null);
        resolve(value);
      }}
    />
  ) : null;

  return { ask, dialog };
}

function PromptDialog({
  opts,
  onDone,
}: {
  opts: PromptOptions;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(opts.defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => onDone(value.trim() || null);

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onMouseDown={() => onDone(null)}
      role="dialog"
      aria-modal="true"
      aria-label={opts.title}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-ink-800 bg-ink-900 p-5 shadow-2xl shadow-black/40"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="display text-[18px] text-ink-100">{opts.title}</h2>
        {opts.helpText && (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">{opts.helpText}</p>
        )}

        {opts.label && (
          <label htmlFor="cms-prompt-input" className="mb-1.5 mt-4 block text-[12px] font-medium text-ink-300">
            {opts.label}
          </label>
        )}
        <input
          id="cms-prompt-input"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onDone(null);
            }
          }}
          placeholder={opts.placeholder}
          className={`${opts.label ? "" : "mt-4 "}w-full rounded-lg border bg-ink-950 px-3 py-2.5 text-[13.5px] text-ink-100 outline-none transition-colors placeholder:text-ink-600 focus:border-flux-500 ${
            opts.error ? "border-fail-500/60" : "border-ink-700"
          }`}
        />
        {opts.error && (
          <p role="alert" className="mt-2 text-[12px] text-fail-500">
            {opts.error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onDone(null)}
            className="rounded-lg border border-ink-700 px-3.5 py-2 text-[13px] text-ink-300 transition-colors hover:border-ink-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-flux-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-flux-400"
          >
            {opts.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
