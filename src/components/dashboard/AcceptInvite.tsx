"use client";

/** The accept button on the invite page — POSTs the token, then heads to /sites. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AUTH_ERROR } from "@/components/auth/styles";

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
    <div className="mt-6">
      {mismatch ? (
        <p className="mb-4 border-2 border-coal bg-sun px-3 py-2 text-[13px] leading-relaxed text-coal">
          You&rsquo;re signed in as <span className="font-mono">{userEmail}</span>, but this invite
          is for <span className="font-mono">{expectedEmail}</span> — accepting will be refused.
          Sign in with the invited email first.
        </p>
      ) : null}
      {error ? <p role="alert" className={`mb-4 ${AUTH_ERROR}`}>{error}</p> : null}
      <button
        type="button"
        onClick={() => void accept()}
        disabled={busy}
        className="btn-poster bg-tomato text-[14px] text-paper disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Joining…" : "Accept invite"}
      </button>
    </div>
  );
}
