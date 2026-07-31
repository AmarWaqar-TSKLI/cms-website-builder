import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { HubActions } from "@/components/dashboard/HubActions";

export const dynamic = "force-dynamic";

/**
 * The main hub — every website this person can reach, as cards. Clicking one
 * opens that site's dashboard (/dashboard?site=…). This is the home base now
 * that a person can run several sites (signup, the AI builder, "＋ Blank site").
 */
export default async function SitesHub() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/sites");

  const sites = await prisma.site.findMany({
    where: { org: { memberships: { some: { userId: user.id } } }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      org: { select: { name: true } },
      pages: { where: { deletedAt: null }, select: { id: true } },
    },
  });

  return (
    <main className="min-h-screen bg-ink-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold text-ink-100">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-flux-500 text-[15px] text-white">
            ◈
          </span>
          <span>Your workspace</span>
        </Link>
        <HubActions user={{ name: user.name, email: user.email }} />
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
        <div className="mb-8">
          <h1 className="display text-[30px] text-ink-100">Your websites</h1>
          <p className="mt-1.5 text-[14px] text-ink-400">
            {sites.length === 0
              ? "No sites yet — create your first one above."
              : `${sites.length} site${sites.length === 1 ? "" : "s"} · click one to open its dashboard.`}
          </p>
        </div>

        {sites.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-800 px-6 py-16 text-center">
            <p className="text-[15px] text-ink-300">You haven&rsquo;t built a site yet.</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-500">
              Use <span className="text-flux-300">✨ New AI site</span> to describe one and have it
              built, or <span className="text-ink-300">＋ Blank site</span> to start from scratch.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard?site=${s.id}`}
                className="group flex flex-col rounded-2xl border border-ink-800 bg-ink-900 p-5 transition-colors hover:border-flux-500/50"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: s.liveReleaseId ? "#22c55e" : "var(--color-ink-600)" }}
                    />
                    {s.liveReleaseId ? "Live" : "Draft"}
                  </span>
                  <span
                    aria-hidden
                    className="text-ink-600 transition-colors group-hover:text-flux-300"
                  >
                    →
                  </span>
                </div>
                <h2 className="display mt-3 truncate text-[19px] text-ink-100">{s.name}</h2>
                <p className="mt-1 truncate font-mono text-[11.5px] text-ink-500">/s/{s.slug}</p>
                <div className="mt-4 flex items-center gap-2.5 text-[11.5px] text-ink-500">
                  <span>
                    {s.pages.length} page{s.pages.length === 1 ? "" : "s"}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-ink-700" />
                  <span className="truncate">{s.org.name}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
