import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser, sitesForUser } from "@/lib/auth";
import { recentActivity } from "@/lib/activity";
import { siteLocks } from "@/lib/locks";
import { LinkBtn } from "@/components/dashboard/dash-ui";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  // The real check. Middleware only saw that a cookie existed; this resolves it
  // against the session table, and everything below is scoped to what came back.
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard");

  const { site: requestedSiteId } = await searchParams;

  // Only sites in orgs this user belongs to. A site id in the query string that
  // is not in this list is ignored rather than refused — the user simply lands
  // on their own first site, which is the right behaviour for a stale bookmark.
  const reachable = await sitesForUser(user.id);
  const targetId =
    requestedSiteId && reachable.some((s) => s.id === requestedSiteId)
      ? requestedSiteId
      : reachable[0]?.id;

  const site = targetId
    ? await prisma.site.findUnique({
        where: { id: targetId },
    include: {
      org: true,
      modules: true,
      pages: {
        where: { deletedAt: null },
        orderBy: { path: "asc" },
        include: { draft: true, _count: { select: { revisions: true } } },
      },
      liveRelease: true,
      _count: { select: { releases: true, products: true, orders: true } },
    },
      })
    : null;

  if (!site) {
    return (
      <main className="grid min-h-screen place-items-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900/70 p-7 text-center">
          <h1 className="text-xl font-semibold tracking-tight">No site here yet</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
            The database is empty, so there is nothing to show. Create the demo site and this page
            fills in.
          </p>
          <pre className="mt-4 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-left font-mono text-[11.5px] text-ink-200">
            make seed
          </pre>
          <p className="mt-2 text-[11.5px] text-ink-500">
            or <code className="font-mono text-ink-300">npm run seed</code>
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <LinkBtn href="/" size="sm" variant="secondary">
              Back home
            </LinkBtn>
            <LinkBtn href="/walkthrough" size="sm" variant="ghost">
              See the walkthrough
            </LinkBtn>
          </div>
        </div>
      </main>
    );
  }

  const [activity, locks, productCount, orderTotals] = await Promise.all([
    recentActivity(site.id, 25),
    siteLocks(site.id),
    prisma.product.count({ where: { siteId: site.id, deletedAt: null } }),
    prisma.order.aggregate({
      where: { siteId: site.id },
      _count: { _all: true },
      _sum: { totalCents: true },
    }),
  ]);

  // If this site is a branch, look up its parent's name for the merge UI.
  const parent = site.parentSiteId
    ? await prisma.site.findUnique({ where: { id: site.parentSiteId }, select: { name: true } })
    : null;

  return (
    <DashboardShell
      user={{ id: user.id, name: user.name, email: user.email }}
      // Every site this user can reach. One org today; the switcher is what makes
      // "different users have different websites" visible rather than asserted.
      sites={reachable.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))}
      activity={activity.map((a) => ({
        id: a.id,
        actorName: a.actorName,
        summary: a.summary,
        action: a.action,
        createdAt: a.createdAt.toISOString(),
      }))}
      locks={locks.map((l) => ({
        pageId: l.pageId,
        path: l.path,
        name: l.name,
        isMine: l.userId === user.id,
      }))}
      site={{
        id: site.id,
        name: site.name,
        slug: site.slug,
        orgName: site.org.name,
        customDomain: site.customDomain,
        modules: site.modules.map((m) => m.module),
        liveReleaseId: site.liveReleaseId,
        parentSiteId: site.parentSiteId,
        parentName: parent?.name ?? null,
      }}
      pages={site.pages.map((page) => ({
        id: page.id,
        path: page.path,
        title: page.title,
        revisionCount: page._count.revisions,
        hasDraft: Boolean(page.draft),
        draftUpdatedAt: page.draft?.updatedAt.toISOString() ?? null,
        lockVersion: page.draft?.lockVersion ?? null,
      }))}
      commerce={{
        productCount,
        orderCount: orderTotals._count._all,
        revenueCents: orderTotals._sum.totalCents ?? 0,
      }}
    />
  );
}
