"use client";

/**
 * Create-account form. Posts to /api/auth/signup, which makes the account, a
 * fresh site of the person's own (never the Acme demo), and a session — so on
 * success they are already signed in and land on their dashboard.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create your account.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-[13.5px] text-ink-100 outline-none transition-colors placeholder:text-ink-600 focus:border-flux-500";
  const label = "mb-1.5 block text-[12px] font-medium text-ink-300";

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-ink-800 bg-ink-900 p-6 shadow-2xl shadow-black/40"
    >
      <label className={label} htmlFor="name">Your name</label>
      <input
        id="name"
        autoComplete="name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`${input} mb-4`}
        placeholder="Alex Rivera"
      />

      <label className={label} htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={`${input} mb-4`}
        placeholder="you@example.com"
      />

      <label className={label} htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={input}
        placeholder="At least 8 characters"
      />

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-fail-500/30 bg-fail-500/10 px-3 py-2 text-[12.5px] text-fail-500"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-lg bg-flux-500 px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Building your site…" : "Create my site — it’s free"}
      </button>
    </form>
  );
}
