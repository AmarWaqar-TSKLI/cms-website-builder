"use client";

/** Header actions for the sites hub: create a site (AI or blank) and sign out. */
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function HubActions({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  async function newBlankSite() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBusy(false);
        return;
      }
      if (data.pageId) router.push(`/editor/${data.pageId}`);
      else router.push(`/dashboard?site=${data.siteId}`);
    } catch {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/build"
        className="rounded-lg bg-flux-500 px-3 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-flux-400"
      >
        ✨ New AI site
      </Link>
      <button
        type="button"
        onClick={newBlankSite}
        disabled={busy}
        className="rounded-lg border border-ink-700 px-3 py-2 text-[12.5px] font-medium text-ink-200 transition-colors hover:border-ink-600 disabled:opacity-50"
      >
        {busy ? "Creating…" : "＋ Blank site"}
      </button>
      <span className="mx-1 hidden h-6 w-px bg-ink-800 sm:block" />
      <span
        title={user.email}
        className="grid h-8 w-8 place-items-center rounded-full bg-flux-500/20 text-[12px] font-semibold text-flux-300"
      >
        {initials || "?"}
      </span>
      <button
        type="button"
        onClick={signOut}
        className="rounded-lg border border-ink-800 px-2.5 py-2 text-[12px] text-ink-400 transition-colors hover:border-ink-600 hover:text-ink-100"
      >
        Sign out
      </button>
    </div>
  );
}
