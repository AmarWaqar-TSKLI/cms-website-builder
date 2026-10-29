"use client";

/**
 * Create-account form. Posts to /api/auth/signup, which makes the account, a
 * fresh site of the person's own (never the Acme demo), and a session — so on
 * success they are already signed in and land on their dashboard.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AUTH_BUTTON, AUTH_CARD, AUTH_ERROR, AUTH_INPUT, AUTH_LABEL } from "./styles";

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
      router.push("/sites");
      router.refresh();
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  const input = AUTH_INPUT;
  const label = AUTH_LABEL;

  return (
    <form
      onSubmit={submit}
      className={AUTH_CARD}
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
          className={`mt-4 ${AUTH_ERROR}`}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className={`mt-6 ${AUTH_BUTTON}`}
      >
        {busy ? "Building your site…" : "Create my site — it’s free"}
      </button>
    </form>
  );
}
