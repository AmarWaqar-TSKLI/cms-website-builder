"use client";

/**
 * First-run welcome.
 *
 * The dashboard's "Start here" card guides an existing site — it always names
 * the single next action. But a person opening this for the very first time has
 * a different question: what IS this, and is it safe to click around? A row of
 * panels doesn't answer that, so a brand-new user gets one short, plain-language
 * orientation before they touch anything.
 *
 * Four beats, in the order the worry arrives: what this is → your work is
 * private → reuse without copy-paste → publishing is reversible. Then it hands
 * straight off to "Start here" and never shows itself again.
 *
 * Shown once per user, remembered per browser under `cms.welcomed:<userId>` —
 * the same localStorage approach as the Technical-details switch, so there is no
 * schema change and no server round-trip. Rendering waits for mount, so the
 * server and first client paint agree and the dialog never flashes. Anyone can
 * reopen it: the "Show intro" link dispatches `cms:show-welcome`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cx } from "../ui";

interface WelcomeStep {
  key: string;
  accent: "flux" | "reuse";
  eyebrow: string;
  title: string;
  body: string;
  art: React.ReactNode;
}

export function Welcome({
  userId,
  userName,
  siteName,
  editHref,
}: {
  userId: string;
  userName: string;
  siteName: string;
  editHref: string;
}) {
  const storageKey = `cms.welcomed:${userId}`;
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const firstName = userName.split(/\s+/)[0] || "there";

  const steps = useMemo<WelcomeStep[]>(
    () => [
      {
        key: "welcome",
        accent: "flux",
        eyebrow: "Welcome",
        title: `Welcome, ${firstName}`,
        body: `This is where you build ${siteName}. You make your site by editing pages — drag things in, click to change them. Here's the whole idea in four quick steps.`,
        art: <ArtWelcome />,
      },
      {
        key: "private",
        accent: "flux",
        eyebrow: "Editing",
        title: "Your work stays private",
        body: "Open any page and change what's on it. Everything saves by itself as you go — but only you can see it. Visitors keep seeing your current site until you choose to publish.",
        art: <ArtEdit />,
      },
      {
        key: "reuse",
        accent: "reuse",
        eyebrow: "Reuse",
        title: "Reuse things across pages",
        body: "Built a header you want everywhere? Select it and choose “Reuse across pages.” Edit it once and every page that uses it updates together — no copy-paste, nothing left behind.",
        art: <ArtReuse />,
      },
      {
        key: "publish",
        accent: "flux",
        eyebrow: "Publishing",
        title: "Publish when you're ready — and you can always go back",
        body: "Publishing puts your site online and saves that exact version. Change your mind later and you can restore any earlier one in a single click. Your products and orders are never touched.",
        art: <ArtPublish />,
      },
    ],
    [firstName, siteName],
  );

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* private mode etc. — worst case it shows again, which is harmless */
    }
    setOpen(false);
  }, [storageKey]);

  const next = useCallback(() => setStep((s) => Math.min(s + 1, steps.length - 1)), [steps.length]);
  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  // First-run detection, and the reopen hook, set up once on mount.
  useEffect(() => {
    setMounted(true);
    try {
      if (window.localStorage.getItem(storageKey) !== "1") setOpen(true);
    } catch {
      /* ignore */
    }
    const onShow = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("cms:show-welcome", onShow);
    return () => window.removeEventListener("cms:show-welcome", onShow);
  }, [storageKey]);

  // Keyboard: Escape closes, arrows page through. Functional setState above keeps
  // these handlers correct without re-binding on every step change.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss, next, back]);

  // Move focus into the dialog when it opens, so the keyboard lands somewhere.
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open]);

  if (!mounted || !open) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div
      className="cms-welcome-overlay fixed inset-0 z-50 grid place-items-center bg-coal/45 p-4"
      onClick={dismiss}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cms-welcome-title"
        aria-describedby="cms-welcome-body"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="cms-welcome-card w-full max-w-[480px] overflow-hidden border-2 border-coal bg-white shadow-[8px_8px_0_var(--color-coal)] outline-none"
      >
        {/* A printed step number on a tomato band, in place of an illustration. */}
        <div className="relative flex h-32 items-end justify-between border-b-2 border-coal bg-tomato px-6 pb-4 text-paper">
          <span className="font-[family-name:var(--font-display)] text-[72px] leading-none font-extrabold">
            {String(step + 1).padStart(2, "0")}
          </span>
          <span className="kicker mb-2 text-paper/80">
            of {String(steps.length).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Skip the intro"
            className="absolute right-4 top-3 text-[13px] font-medium text-paper underline decoration-2 underline-offset-4 hover:text-coal"
          >
            Skip
          </button>
        </div>

        <div className="p-6">
          <p className="kicker text-tomato">
            {current.eyebrow}
          </p>
          <h2 id="cms-welcome-title" className="display mt-2 text-[26px] leading-tight text-coal">
            {current.title}
          </h2>
          <p
            id="cms-welcome-body"
            className="mt-2.5 min-h-[4.5rem] text-[15px] leading-relaxed text-coal/80"
          >
            {current.body}
          </p>

          <div className="mt-5 flex items-center justify-between gap-3">
            {/* Progress dots — also clickable, so it's a stepper, not just a readout. */}
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Intro steps">
              {steps.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={i === step}
                  aria-label={`Step ${i + 1}: ${s.title}`}
                  onClick={() => setStep(i)}
                  className={cx(
                    "h-2 transition-all",
                    i === step ? "w-6 bg-tomato" : "w-2 bg-coal/25 hover:bg-coal/50",
                  )}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={back}
                  className="btn-poster bg-white px-3.5 py-2 text-[13.5px]"
                >
                  Back
                </button>
              )}
              {isLast ? (
                <Link
                  href={editHref}
                  onClick={dismiss}
                  className="btn-poster bg-tomato px-4 py-2 text-[13.5px] text-paper"
                >
                  Start building
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={next}
                  className="btn-poster bg-tomato px-4 py-2 text-[13.5px] text-paper"
                >
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* A gentle entrance, turned off for anyone who asked for less motion. */}
      <style>{`
        @keyframes cms-welcome-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: none; }
        }
        .cms-welcome-card { animation: cms-welcome-in 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
        .cms-welcome-overlay { animation: cms-welcome-in 0.2s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .cms-welcome-card, .cms-welcome-overlay { animation: none; }
        }
      `}</style>
    </div>
  );
}

/* ── Illustrations ─────────────────────────────────────────────────────────
   Line art in currentColor, so each inherits its step's accent. Small enough to
   read at a glance, specific enough to name the idea. */

function ArtWelcome() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="6" y="10" width="52" height="40" rx="4" />
      <path d="M6 20h52" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="17" cy="15" r="1.4" fill="currentColor" stroke="none" />
      <path d="M14 30h24" strokeLinecap="round" opacity="0.9" />
      <path d="M14 37h34" strokeLinecap="round" opacity="0.55" />
      <path d="M14 43h18" strokeLinecap="round" opacity="0.55" />
      <path d="M50 8l1.6 3.6L55 13l-3.4 1.4L50 18l-1.6-3.6L45 13l3.4-1.4z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ArtEdit() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="8" y="8" width="48" height="48" rx="4" opacity="0.5" />
      <rect x="15" y="16" width="34" height="9" rx="2" />
      <rect x="15" y="30" width="22" height="6" rx="2" opacity="0.5" />
      <rect x="15" y="40" width="28" height="6" rx="2" opacity="0.5" />
      {/* a cursor, mid-edit */}
      <path d="M40 34l14 6-6 2-2 6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ArtReuse() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {/* two pages sharing one block */}
      <rect x="6" y="12" width="22" height="40" rx="3" opacity="0.55" />
      <rect x="36" y="12" width="22" height="40" rx="3" opacity="0.55" />
      <rect x="9" y="16" width="16" height="8" rx="2" fill="currentColor" stroke="none" />
      <rect x="39" y="16" width="16" height="8" rx="2" fill="currentColor" stroke="none" />
      <path d="M25 20h14" strokeDasharray="2 3" opacity="0.8" />
      <path d="M28 44l4-4 4 4-4 4z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ArtPublish() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {/* a stack of saved versions, newest on top with a globe */}
      <rect x="14" y="40" width="36" height="10" rx="3" opacity="0.4" />
      <rect x="12" y="30" width="40" height="10" rx="3" opacity="0.65" />
      <rect x="10" y="18" width="44" height="12" rx="3" />
      <circle cx="46" cy="16" r="8" fill="var(--color-ink-900)" />
      <circle cx="46" cy="16" r="8" />
      <path d="M38 16h16M46 8c2.4 2.2 2.4 13.8 0 16M46 8c-2.4 2.2-2.4 13.8 0 16" strokeWidth="1.4" />
    </svg>
  );
}
