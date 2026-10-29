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
  if (!next) return "/sites";
  if (!next.startsWith("/") || next.startsWith("//")) return "/sites";
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
      className="border-2 border-coal bg-white p-6 shadow-[6px_6px_0_var(--color-coal)]"
    >
      <label className="kicker mb-1.5 block text-coal/70" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-4 w-full border-2 border-coal bg-paper px-3 py-2.5 text-[15px] text-coal outline-none placeholder:text-coal/40 focus:bg-white"
        placeholder="you@example.com"
      />

      <label className="kicker mb-1.5 block text-coal/70" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full border-2 border-coal bg-paper px-3 py-2.5 text-[15px] text-coal outline-none placeholder:text-coal/40 focus:bg-white"
        placeholder="••••••••"
      />

      {error && (
        <p
          role="alert"
          className="mt-4 border-2 border-tomato bg-tomato/10 px-3 py-2 text-[13.5px] text-tomato-deep"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="btn-poster mt-6 w-full justify-center bg-tomato text-[15px] text-paper disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="mt-4 text-center text-[13px] text-coal/70">
        <a href="/forgot" className="underline-offset-4 hover:text-tomato hover:underline">
          Forgot your password?
        </a>
      </p>

      <p className="mt-5 border-t border-coal/20 pt-4 text-center text-[13.5px] text-coal/80">
        New here?{" "}
        <a href="/signup" className="font-semibold underline decoration-2 underline-offset-4 hover:text-tomato">
          Create your site — it&rsquo;s free
        </a>
      </p>

      <p className="mt-4 bg-sun px-3 py-2.5 text-[13px] leading-relaxed text-coal">
        <span className="font-semibold">Try the demo:</span>{" "}
        <span className="font-mono">amar@acme.test</span> or <span className="font-mono">sara@acme.test</span>,
        password <span className="font-mono">demo1234</span>. Sign in as each in two browsers to see the
        editing lock.
      </p>
    </form>
  );
}
