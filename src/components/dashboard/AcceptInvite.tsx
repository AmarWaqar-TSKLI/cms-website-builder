"use client";

/** The accept button on the invite page — POSTs the token, then heads to /sites. */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptInvite({
  token,
  expectedEmail,
  userEmail,
}: {
  token: string;
  expectedEmail: string;
  userEmail: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const mismatch = expectedEmail.toLowerCase() !== userEmail.toLowerCase();

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't accept the invite.");
        return;
      }
      router.push("/sites");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      {mismatch ? (
        <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] leading-relaxed text-amber-300">
          You&rsquo;re signed in as <span className="font-mono">{userEmail}</span>, but this invite
          is for <span className="font-mono">{expectedEmail}</span> — accepting will be refused.
          Sign in with the invited email first.
        </p>
      ) : null}
      {error ? <p className="mb-3 text-[13px] text-fail-500">{error}</p> : null}
      <button
        type="button"
        onClick={() => void accept()}
        disabled={busy}
        className="rounded-lg bg-flux-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:opacity-40"
      >
        {busy ? "Joining…" : "Accept invite"}
      </button>
    </div>
  );
}
