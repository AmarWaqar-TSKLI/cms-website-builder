import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { HubActions } from "@/components/dashboard/HubActions";
import { HubMasthead } from "@/components/dashboard/HubMasthead";

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
    <main className="min-h-screen bg-paper text-coal">
      <HubMasthead section="Your workspace">
        <HubActions user={{ name: user.name, email: user.email }} />
      </HubMasthead>

      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="anim-rise grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="kicker text-tomato">
              {sites.length === 0
                ? "Day one"
                : `${sites.length} site${sites.length === 1 ? "" : "s"} in this workspace`}
            </p>
            <h1 className="display-mega mt-4 text-[clamp(44px,7vw,84px)]">
              Your <span className="mark-sun">websites.</span>
            </h1>
          </div>
          <p className="max-w-[34ch] text-[16px] leading-relaxed text-coal/75">
            Open one to build, publish, branch and roll back. Every version stays one click away.
          </p>
        </div>

        {sites.length === 0 ? (
          <div className="anim-pop mt-12 border-2 border-dashed border-coal px-6 py-20 text-center">
            <p className="display text-[26px]">Nothing here yet.</p>
            <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-coal/75">
              Start with <span className="font-semibold">New AI site</span> and describe the thing, or{" "}
              <span className="font-semibold">Blank site</span> to lay every block yourself.
            </p>
          </div>
        ) : (
          // A ruled list, like a contents page: branches sit right under their
          // parent (the ordering above), and the whole row is the link.
          <ul className="mt-12 border-t-2 border-coal">
            {sites.map((s, i) => (
              <li key={s.id} className={cxOrder("anim-rise border-b-2 border-coal", i)}>
                <Link
                  href={`/dashboard?site=${s.id}`}
                  className={`group grid gap-3 py-6 transition-colors hover:bg-white sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8 sm:px-4 ${
                    s.parentSiteId ? "sm:pl-12" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <h2 className="display truncate text-[clamp(24px,3vw,34px)]">{s.name}</h2>
                      <span className="truncate font-mono text-[13px] text-coal/60">
                        {s.customDomain ?? `/s/${s.slug}`}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] text-coal/70">
                      <span
                        className={
                          s.liveReleaseId
                            ? "kicker border-2 border-coal bg-live-500 px-2 py-0.5 text-[11px] text-white"
                            : "kicker border-2 border-coal bg-paper-deep px-2 py-0.5 text-[11px]"
                        }
                      >
                        {s.liveReleaseId ? "Live" : "Draft"}
                      </span>
                      {s.parentSiteId ? (
                        <span className="kicker border-2 border-coal bg-cobalt px-2 py-0.5 text-[11px] text-paper">
                          {nameById.get(s.parentSiteId) ? `Branch of ${nameById.get(s.parentSiteId)}` : "Branch"}
                        </span>
                      ) : null}
                      <span>
                        {s.pages.length} page{s.pages.length === 1 ? "" : "s"}
                      </span>
                      <span className="truncate">{s.org.name}</span>
                    </div>
                  </div>
                  <span className="text-[15px] font-semibold underline decoration-2 underline-offset-4 group-hover:text-tomato">
                    Open dashboard <span aria-hidden>→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
