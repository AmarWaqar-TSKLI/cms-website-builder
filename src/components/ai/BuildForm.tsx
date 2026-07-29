"use client";

/**
 * "Describe your site" → the AI builds it. Posts the description to
 * /api/ai/generate-site and, on success, drops the person straight into the
 * editor on their freshly-generated homepage.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = [
  "a cozy coffee shop in Lisbon",
  "a freelance photographer's portfolio",
  "a yoga studio with class schedules",
  "a landing page for a budgeting app",
];

const STEPS = [
  "Reading your idea…",
  "Writing your words…",
  "Placing the sections…",
  "Almost there…",
];

export function BuildForm() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  // Rotate the reassuring status line while the model works.
  useEffect(() => {
    if (!busy) {
      setStep(0);
      return;
    }
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 1900);
    return () => clearInterval(t);
  }, [busy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = description.trim();
    if (busy || text.length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not build your site.");
        return;
      }
      if (data.pageId) router.push(`/editor/${data.pageId}`);
      else router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="rounded-2xl border border-ink-800 bg-ink-900 p-2 shadow-2xl shadow-black/40 focus-within:border-flux-500/60">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          rows={3}
          maxLength={400}
          placeholder="e.g. a cozy coffee shop in Lisbon with fresh pastries and free wifi"
          className="w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-ink-100 outline-none placeholder:text-ink-600 disabled:opacity-60"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
          }}
        />
        <div className="flex items-center justify-between gap-3 px-1 pb-1">
          <span className="pl-2 text-[11.5px] text-ink-600">
            {busy ? STEPS[step] : "Press ⌘/Ctrl + Enter to build"}
          </span>
          <button
            type="submit"
            disabled={busy || description.trim().length < 3}
            className="shrink-0 rounded-xl bg-flux-500 px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Building…" : "Build my site ✨"}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-fail-500/30 bg-fail-500/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-fail-500"
        >
          {error}
        </p>
      )}

      {!busy && !error && (
        <div className="mt-5 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setDescription(ex)}
              className="rounded-full border border-ink-800 bg-ink-900 px-3 py-1.5 text-[12px] text-ink-400 transition-colors hover:border-ink-700 hover:text-ink-200"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
