"use client";

/** The two small client forms of the reset flow: request a link, set a new password. */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AUTH_BUTTON, AUTH_CARD, AUTH_ERROR, AUTH_INPUT, AUTH_LABEL, AUTH_LINK } from "./styles";

const INPUT = AUTH_INPUT;
const BUTTON = AUTH_BUTTON;

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
      <p className={`${AUTH_CARD} text-[15px] leading-relaxed text-coal`}>
        If an account exists for <span className="font-mono text-[13px]">{email}</span>, a reset
        link is on its way. It works once and expires in an hour.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className={`${AUTH_CARD} space-y-5`}>
      {error && (
        <p role="alert" className={AUTH_ERROR}>
          {error}
        </p>
      )}
      <div>
        <label className={AUTH_LABEL} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className={INPUT}
        />
      </div>
      <button type="submit" disabled={busy || !email.trim()} className={BUTTON}>
        {busy ? "Sending…" : "Email me a reset link"}
      </button>
      <p className="border-t border-coal/20 pt-4 text-center text-[13.5px] text-coal/80">
        Remembered it?{" "}
        <Link href="/login" className={AUTH_LINK}>
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
    <form onSubmit={submit} className={`${AUTH_CARD} space-y-5`}>
      {error && (
        <p role="alert" className={AUTH_ERROR}>
          {error}
        </p>
      )}
      <div>
        <label className={AUTH_LABEL} htmlFor="password">
          New password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (8+ characters)"
          className={INPUT}
        />
      </div>
      <button type="submit" disabled={busy || password.length < 8} className={BUTTON}>
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
