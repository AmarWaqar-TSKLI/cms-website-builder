"use client";

/**
 * TECHNICAL DETAILS — one switch, two audiences, shared by the whole product.
 *
 * Somebody running a shop wants to know whether their site is live. A developer
 * evaluating the architecture wants to know which table a number came from.
 * Showing table names to the first reader is noise; hiding them from the second
 * throws away the thing that makes the design legible.
 *
 * So it is one switch rather than two products. Off, this is a plain website
 * builder. On, every panel says what it is backed by. The dashboard owns the
 * checkbox; the editor reads the same setting, so flipping it in one place
 * changes both. The value is remembered per browser under `cms.technical`.
 *
 * This lived in the dashboard kit first. It moved here the moment the editor
 * needed the same two readers — a shared idea belongs in a shared file.
 */
import { createContext, useContext, type ReactNode } from "react";

const TechnicalContext = createContext(false);

export function TechnicalDetails({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return <TechnicalContext.Provider value={enabled}>{children}</TechnicalContext.Provider>;
}

export function useTechnical() {
  return useContext(TechnicalContext);
}

/**
 * The checkbox itself. Same wording and behaviour wherever it appears, so a
 * person who finds it on the dashboard recognises it in the editor.
 */
export function TechnicalToggle({
  enabled,
  onChange,
  className,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={
        "flex cursor-pointer select-none items-center gap-2 text-[12px] text-ink-400 " +
        (className ?? "")
      }
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--color-flux-500)]"
      />
      Technical details
    </label>
  );
}
