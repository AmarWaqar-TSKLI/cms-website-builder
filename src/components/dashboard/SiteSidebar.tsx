"use client";

/**
 * The app's left rail — one persistent place for who you are, which site you're
 * in, and where to go. It replaces the old top AccountBar + section TopBar with
 * a Linear-style sidebar: workspace + site switcher up top, per-site sections in
 * the middle (highlighted by the current route), account + sign-out at the foot.
 */
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cx } from "../ui";

type NavItem = { label: string; href: string; active: boolean; icon: React.ReactNode };

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

const PATHS = {
  overview: "M4 5h16M4 12h16M4 19h10",
  store: "M3 9l1-5h16l1 5M4 9v10h16V9M9 13h6",
  media: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6",
  blog: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5",
  forms: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h3",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  live: "M14 3h7v7M21 3l-9 9M10 5H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6",
};

export function SiteSidebar({
  user,
  sites,
  currentSiteId,
  currentSiteName,
  modules,
  technical,
  onTechnicalChange,
  editHref,
  liveUrl,
}: {
  user: { name: string; email: string };
  sites: { id: string; name: string; slug: string }[];
  currentSiteId: string;
  currentSiteName: string;
  modules: string[];
  technical: boolean;
  onTechnicalChange: (next: boolean) => void;
  editHref: string;
  liveUrl: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  const q = `?site=${currentSiteId}`;
  const nav: NavItem[] = [
    {
      label: "Overview",
      href: `/dashboard${q}`,
      active: pathname === "/dashboard",
      icon: <Icon d={PATHS.overview} />,
    },
    ...(modules.includes("commerce")
      ? [
          {
            label: "Store",
            href: `/dashboard/products${q}`,
            active: pathname.startsWith("/dashboard/products"),
            icon: <Icon d={PATHS.store} />,
          },
        ]
      : []),
    {
      label: "Media",
      href: `/dashboard/media${q}`,
      active: pathname.startsWith("/dashboard/media"),
      icon: <Icon d={PATHS.media} />,
    },
    ...(modules.includes("blog")
      ? [
          {
            label: "Blog",
            href: `/dashboard/blog${q}`,
            active: pathname.startsWith("/dashboard/blog"),
            icon: <Icon d={PATHS.blog} />,
          },
        ]
      : []),
    ...(modules.includes("forms")
      ? [
          {
            label: "Forms",
            href: `/dashboard/forms${q}`,
            active: pathname.startsWith("/dashboard/forms"),
            icon: <Icon d={PATHS.forms} />,
          },
        ]
      : []),
  ];

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

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const itemClass = (active: boolean) =>
    cx(
      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
      active ? "bg-ink-850 font-medium text-ink-100" : "text-ink-400 hover:bg-ink-850 hover:text-ink-100",
    );

  return (
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-ink-800 bg-ink-900 px-3 py-4 lg:flex">
      {/* Workspace + site switcher */}
      <Link
        href="/sites"
        className="mx-1 flex items-center gap-2 text-[13px] font-semibold tracking-tight text-ink-100"
      >
        <span className="grid h-6 w-6 place-items-center rounded-md bg-flux-500 text-[11px] text-ink-900">◆</span>
        Workspace
      </Link>

      <div className="mt-3 px-1">
        {sites.length > 1 ? (
          <select
            value={currentSiteId}
            onChange={(e) => router.push(`/dashboard?site=${e.target.value}`)}
            aria-label="Switch site"
            className="w-full rounded-md border border-ink-800 bg-ink-950 px-2.5 py-1.5 text-[12.5px] font-medium text-ink-100 outline-none focus:border-ink-600"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="rounded-md border border-ink-800 bg-ink-950 px-2.5 py-1.5 text-[12.5px] font-medium text-ink-100">
            {currentSiteName}
          </div>
        )}
      </div>

      {/* Sections */}
      <nav className="mt-5 flex flex-col gap-0.5">
        {nav.map((item) => (
          <Link key={item.label} href={item.href} className={itemClass(item.active)}>
            <span className={item.active ? "text-ink-100" : "text-ink-500"}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Quick actions */}
      <div className="mt-4 flex flex-col gap-0.5 border-t border-ink-800 pt-4">
        <Link href={editHref} className={itemClass(false)}>
          <span className="text-ink-500">
            <Icon d={PATHS.edit} />
          </span>
          Open editor
        </Link>
        <a href={liveUrl} target="_blank" rel="noreferrer" className={itemClass(false)}>
          <span className="text-ink-500">
            <Icon d={PATHS.live} />
          </span>
          View live site
        </a>
      </div>

      {/* Account */}
      <div className="mt-auto flex flex-col gap-3 border-t border-ink-800 pt-3">
        <label className="mx-1 flex cursor-pointer select-none items-center gap-2 text-[12px] text-ink-400">
          <input
            type="checkbox"
            checked={technical}
            onChange={(e) => onTechnicalChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-flux-500)]"
          />
          Technical details
        </label>
        <div className="flex items-center gap-2 px-1">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-800 text-[11px] font-semibold text-ink-200">
            {initials || "?"}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-300" title={user.email}>
            {user.name}
          </span>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            title="Sign out"
            className="rounded-md border border-ink-800 px-2 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-ink-600 hover:text-ink-100 disabled:opacity-50"
          >
            {busy ? "…" : "Out"}
          </button>
        </div>
      </div>
    </aside>
  );
}
