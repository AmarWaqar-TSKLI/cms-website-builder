"use client";

/** The two small client forms of the reset flow: request a link, set a new password. */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const INPUT =
  "w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[14px] text-ink-100 placeholder:text-ink-600 focus:border-flux-500 focus:outline-none";
const BUTTON =
  "w-full rounded-lg bg-flux-500 px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:opacity-40";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="text-[14px] leading-relaxed text-ink-300">
        If an account exists for <span className="font-mono text-[13px]">{email}</span>, a reset
        link is on its way. It works once and expires in an hour.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <p className="text-[13px] text-fail-500">{error}</p>}
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className={INPUT}
      />
      <button type="submit" disabled={busy || !email.trim()} className={BUTTON}>
        {busy ? "Sending…" : "Email me a reset link"}
      </button>
      <p className="text-center text-[12.5px] text-ink-500">
        Remembered it?{" "}
        <Link href="/login" className="text-flux-300 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.push("/login?reset=1");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <p className="text-[13px] text-fail-500">{error}</p>}
      <input
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password (8+ characters)"
        className={INPUT}
      />
      <button type="submit" disabled={busy || password.length < 8} className={BUTTON}>
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
