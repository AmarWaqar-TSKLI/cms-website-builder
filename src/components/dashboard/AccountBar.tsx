"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Who you are, which site you are looking at, and the way out.
 *
 * The site list only ever contains sites this user's organisation owns — the
 * server built it that way. Nothing here is hidden-but-reachable: asking for a
 * site id that is not in this list returns 403 from every endpoint, so the
 * switcher is a convenience over the boundary rather than the boundary itself.
 */
export function AccountBar({
  user,
  sites,
  currentSiteId,
  technical,
  onTechnicalChange,
}: {
  user: { name: string; email: string };
  sites: { id: string; name: string; slug: string }[];
  currentSiteId: string;
  technical: boolean;
  onTechnicalChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-ink-800 bg-ink-900/60 px-5 py-2.5 sm:px-8">
      <a
        href="/sites"
        title="All your websites"
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-ink-300 transition-colors hover:bg-ink-850 hover:text-ink-100"
      >
        <span className="text-ink-500">←</span> All sites
      </a>
      {sites.length > 1 ? (
        <select
          value={currentSiteId}
          onChange={(e) => router.push(`/dashboard?site=${e.target.value}`)}
          className="rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-ink-100 outline-none focus:border-flux-500"
          aria-label="Switch site"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-[12.5px] text-ink-400">{sites[0]?.name}</span>
      )}

      <div className="ml-auto flex items-center gap-2.5">
        {/*
          One switch, two audiences. Off, this reads as a website builder; on,
          every panel names the table behind it. Shipping two products, or
          showing table names to somebody running a shop, would both be worse.
        */}
        <label className="hidden cursor-pointer select-none items-center gap-2 text-[12px] text-ink-400 sm:flex">
          <input
            type="checkbox"
            checked={technical}
            onChange={(e) => onTechnicalChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-flux-500)]"
          />
          Technical details
        </label>
        <span className="hidden h-4 w-px bg-ink-800 sm:block" />
        <span
          title={user.email}
          className="grid h-7 w-7 place-items-center rounded-full bg-flux-500/20 text-[11px] font-semibold text-flux-300"
        >
          {initials || "?"}
        </span>
        <span className="hidden text-[12.5px] text-ink-300 sm:inline">{user.name}</span>
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="rounded-lg border border-ink-800 px-2.5 py-1.5 text-[12px] text-ink-400 transition-colors hover:border-ink-600 hover:text-ink-100 disabled:opacity-50"
        >
          {busy ? "…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
