"use client";

/**
 * "2 minutes ago", refreshed on a timer.
 *
 * Rendered empty on the server so the markup the browser receives never
 * disagrees with the markup React makes after hydration; the real value
 * appears on the first client tick. The exact timestamp is on the tooltip for
 * anyone who wants it.
 */
import { useEffect, useState } from "react";
import { exactTime, relativeTime } from "./dash-ui";

export function Ago({
  at,
  className,
  fallback = "",
}: {
  at: string | Date | null | undefined;
  className?: string;
  fallback?: string;
}) {
  const [text, setText] = useState<string>(fallback);

  useEffect(() => {
    if (!at) return;
    const tick = () => setText(relativeTime(at));
    tick();
    const timer = setInterval(tick, 20_000);
    return () => clearInterval(timer);
  }, [at]);

  if (!at) return null;
  return (
    <span className={className} title={exactTime(at)} suppressHydrationWarning>
      {text}
    </span>
  );
}
