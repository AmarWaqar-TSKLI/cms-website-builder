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

  const rows = await prisma.site.findMany({
    where: { org: { memberships: { some: { userId: user.id } } }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      org: { select: { name: true } },
      pages: { where: { deletedAt: null }, select: { id: true } },
    },
  });

  // Branches sit with their parent, not scattered through the grid by age: each
  // trunk site is followed by its branches; a branch whose parent is archived
  // falls back to the end.
  const nameById = new Map(rows.map((s) => [s.id, s.name]));
  const trunks = rows.filter((s) => !s.parentSiteId);
  const branchesOf = (id: string) => rows.filter((s) => s.parentSiteId === id);
  const orphans = rows.filter((s) => s.parentSiteId && !nameById.has(s.parentSiteId));
  const sites = [...trunks.flatMap((t) => [t, ...branchesOf(t.id)]), ...orphans];

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

      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
        {/* The loud voice: an oversized hero header with a sticker count. */}
        <div className="anim-rise mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 inline-block -rotate-1 rounded-lg border-2 border-ink-100 bg-pop-yellow px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-100">
              {sites.length === 0
                ? "day one"
                : `${sites.length} site${sites.length === 1 ? "" : "s"} in the shop`}
            </p>
            <h1 className="display-mega text-[clamp(34px,6vw,56px)] text-ink-100">
              Your websites
            </h1>
          </div>
          <p className="max-w-[26ch] text-[13.5px] leading-relaxed text-ink-400">
            Every card is a live little world — open one to build, publish, branch and roll back.
          </p>
        </div>

        {sites.length === 0 ? (
          <div className="anim-pop rounded-3xl border-2 border-dashed border-ink-700 px-6 py-20 text-center">
            <p className="display text-[22px] text-ink-100">Nothing here yet — good.</p>
            <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-500">
              Blank canvas energy. Hit <span className="font-semibold text-flux-300">✨ New AI site</span>{" "}
              and describe the thing, or <span className="font-semibold text-ink-300">＋ Blank site</span>{" "}
              to lay every block yourself.
            </p>
          </div>
        ) : (
          // Bento: the grid breathes — live sites read at a glance, branches sit
          // right under their parent (the ordering above), every card is a tiny
          // browser window because that's literally what it is.
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((s, i) => (
              <Link
                key={s.id}
                href={`/dashboard?site=${s.id}`}
                className={cxOrder(
                  "punchable anim-rise group flex flex-col overflow-hidden rounded-2xl border-2 border-ink-100 bg-ink-900 hover:shadow-punch",
                  i,
                )}
              >
                {/* Window chrome — the card IS a website. */}
                <div className="flex items-center gap-1.5 border-b-2 border-ink-100 bg-ink-850 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-ink-100 bg-pop-pink" />
                  <span className="h-2.5 w-2.5 rounded-full border border-ink-100 bg-pop-yellow" />
                  <span className="h-2.5 w-2.5 rounded-full border border-ink-100 bg-live-500" />
                  <span className="ml-2 truncate font-mono text-[10.5px] text-ink-500">
                    {s.customDomain ?? `/s/${s.slug}`}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="display min-w-0 truncate text-[20px] text-ink-100">{s.name}</h2>
                    <span
                      aria-hidden
                      className="shrink-0 text-[18px] text-ink-600 transition-transform duration-150 group-hover:translate-x-1 group-hover:text-flux-300"
                    >
                      →
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={
                        s.liveReleaseId
                          ? "rounded-lg border-[1.5px] border-live-500 bg-live-500/12 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-live-500"
                          : "rounded-lg border-[1.5px] border-ink-600 bg-ink-850 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-400"
                      }
                    >
                      {s.liveReleaseId ? "● Live" : "Draft"}
                    </span>
                    {s.parentSiteId ? (
                      <span className="rounded-lg border-[1.5px] border-flux-500 bg-flux-500/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-flux-300">
                        ⑂ {nameById.get(s.parentSiteId) ? `branch of ${nameById.get(s.parentSiteId)}` : "branch"}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-auto flex items-center gap-2.5 pt-4 text-[11.5px] font-medium text-ink-500">
                    <span>
                      {s.pages.length} page{s.pages.length === 1 ? "" : "s"}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-ink-600" />
                    <span className="truncate">{s.org.name}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

/** Entrance stagger: the first six cards rise in sequence, the rest just rise. */
function cxOrder(base: string, index: number): string {
  const delay = index < 6 ? ` d-${index + 1}` : "";
  return base + delay;
}
