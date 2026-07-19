import { prisma } from "@/lib/db";
import { LinkBtn } from "@/components/dashboard/dash-ui";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const site = await prisma.site.findFirst({
    orderBy: { createdAt: "asc" },
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
  });

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

  const [productCount, orderTotals] = await Promise.all([
    prisma.product.count({ where: { siteId: site.id, deletedAt: null } }),
    prisma.order.aggregate({
      where: { siteId: site.id },
      _count: { _all: true },
      _sum: { totalCents: true },
    }),
  ]);

  return (
    <DashboardShell
      site={{
        id: site.id,
        name: site.name,
        slug: site.slug,
        orgName: site.org.name,
        customDomain: site.customDomain,
        modules: site.modules.map((m) => m.module),
        liveReleaseId: site.liveReleaseId,
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
