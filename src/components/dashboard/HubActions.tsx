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
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/build" className="btn-poster bg-tomato px-3.5 py-2.5 text-[14px] text-paper">
        New AI site
      </Link>
      <Link href="/templates" className="btn-poster bg-white px-3.5 py-2.5 text-[14px]">
        Templates
      </Link>
      <button
        type="button"
        onClick={newBlankSite}
        disabled={busy}
        className="btn-poster bg-white px-3.5 py-2.5 text-[14px] disabled:opacity-50"
      >
        {busy ? "Creating…" : "Blank site"}
      </button>
      <span className="mx-1 hidden h-7 w-0.5 bg-coal sm:block" />
      <span
        title={user.email}
        className="grid h-9 w-9 place-items-center rounded-full border-2 border-coal bg-sun text-[12px] font-bold"
      >
        {initials || "?"}
      </span>
      <button
        type="button"
        onClick={signOut}
        className="text-[14px] font-medium underline decoration-2 underline-offset-4 hover:text-tomato"
      >
        Sign out
      </button>
    </div>
  );
}
