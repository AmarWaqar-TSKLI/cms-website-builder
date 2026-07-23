"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The sign-in form.
 *
 * Note what it does NOT do: it never says which half was wrong. The server
 * returns one message for both, and repeating that message verbatim is what
 * keeps the endpoint from being a way to discover who has an account.
 *
 * `next` is validated before use. A redirect target that arrives in the URL is
 * attacker-controlled, so anything that is not a path on this site is discarded
 * — otherwise this is an open redirect, and a convincing phishing hop.
 */
function safeNext(next: string | undefined): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Could not sign in");
        return;
      }

      router.push(safeNext(next));
      router.refresh();
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-ink-800 bg-ink-900 p-6 shadow-2xl shadow-black/40"
    >
      <label className="mb-1.5 block text-[12px] font-medium text-ink-300" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-4 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-[13.5px] text-ink-100 outline-none transition-colors placeholder:text-ink-600 focus:border-flux-500"
        placeholder="you@example.com"
      />

      <label className="mb-1.5 block text-[12px] font-medium text-ink-300" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-[13.5px] text-ink-100 outline-none transition-colors placeholder:text-ink-600 focus:border-flux-500"
        placeholder="••••••••"
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
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="mt-5 border-t border-ink-800 pt-4 text-[11.5px] leading-relaxed text-ink-500">
        Demo accounts — <span className="text-ink-300">amar@acme.test</span>,{" "}
        <span className="text-ink-300">sara@acme.test</span>, both with password{" "}
        <span className="font-mono text-ink-300">demo1234</span>. Sign in as each in two browsers to
        see the editing lock.
      </p>
    </form>
  );
}
