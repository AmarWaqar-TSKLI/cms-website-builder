import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser, sitesForUser } from "@/lib/auth";
import { Card, CardHead, LinkBtn, Tile, UnderTheHood, money } from "@/components/dashboard/dash-ui";
import { AppShell } from "@/components/dashboard/AppShell";
import { ProductManager } from "@/components/dashboard/ProductManager";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/products");

  const { site: requestedSiteId } = await searchParams;
  const reachable = await sitesForUser(user.id);
  const targetId =
    requestedSiteId && reachable.some((s) => s.id === requestedSiteId)
      ? requestedSiteId
      : reachable[0]?.id;
  const site = targetId
    ? await prisma.site.findUnique({
        where: { id: targetId },
        include: {
          modules: true,
          collections: { where: { deletedAt: null }, orderBy: { title: "asc" } },
        },
      })
    : null;

  if (!site) {
    return (
      <main className="grid min-h-screen place-items-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900/70 p-7 text-center">
          <h1 className="text-xl font-semibold tracking-tight">No store to show</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
            There is no site in the database yet. Create the demo site and your products appear
            here.
          </p>
          <pre className="mt-4 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-left font-mono text-[11.5px] text-ink-200">
            make seed
          </pre>
        </div>
      </main>
    );
  }

  const [orders, totals, productCount] = await Promise.all([
    prisma.order.findMany({
      where: { siteId: site.id },
      orderBy: { placedAt: "desc" },
      take: 8,
      include: { lineItems: true, customer: true },
    }),
    prisma.order.aggregate({
      where: { siteId: site.id },
      _count: { _all: true },
      _sum: { totalCents: true },
    }),
    prisma.product.count({ where: { siteId: site.id, deletedAt: null } }),
  ]);

  const revenue = totals._sum.totalCents ?? 0;
  const orderCount = totals._count._all;
  const home = await prisma.page.findFirst({
    where: { siteId: site.id, path: "/", deletedAt: null },
    select: { id: true },
  });

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      sites={reachable.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))}
      site={{
        id: site.id,
        name: site.name,
        slug: site.slug,
        customDomain: site.customDomain,
        modules: site.modules.map((m) => m.module),
      }}
      editHref={home ? `/editor/${home.id}` : "/dashboard"}
    >
      <header className="mb-5">
        <h1 className="text-[28px] font-semibold tracking-tight text-ink-100 sm:text-[32px]">
          Store
        </h1>
        <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-ink-300">
          What you sell, what it costs, and what people have bought. All of it is live: changes take
          effect in your database immediately, and pages you have already published keep the prices
          they were built with until you publish again.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="On sale" value={productCount} sub="products" title="products (deleted_at is null)" />
        <Tile label="Orders" value={orderCount} sub="all time" title="orders" />
        <Tile label="Revenue" value={money(revenue)} sub="all time" title="sum of orders.total_cents" />
        <Tile
          label="Average order"
          value={money(orderCount ? Math.round(revenue / orderCount) : 0)}
          sub={orderCount ? `across ${orderCount} order${orderCount === 1 ? "" : "s"}` : "no orders yet"}
        />
      </div>

      <ProductManager siteId={site.id} collectionId={site.collections[0]?.id ?? null} />

      <Card className="mt-5 p-5 sm:p-6">
        <CardHead
          title="Recent orders"
          hint="Placed from the published site itself — the static page writes an order without changing by a single byte."
          tables="orders · order_line_items"
        />

        {orders.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-ink-700 px-4 py-8 text-center">
            <p className="text-[13px] text-ink-200">No orders yet.</p>
            <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-ink-500">
              Open your live site, add something to the cart and check out — an order will appear
              here while the page itself stays exactly as it was published.
            </p>
            <LinkBtn href={`/s/${site.slug}`} external size="sm" variant="secondary" className="mt-4">
              Open live site ↗
            </LinkBtn>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-ink-800 bg-ink-950/60 px-3.5 py-3"
              >
                <span className="text-[13px] font-medium text-ink-100">
                  {o.customer?.name ?? "Guest checkout"}
                </span>
                <span className="text-[11.5px] text-ink-400">
                  {o.lineItems.length} item{o.lineItems.length === 1 ? "" : "s"}
                </span>
                <span
                  className="hidden font-mono text-[10.5px] text-ink-600 sm:inline"
                  title={`orders.id ${o.id}`}
                >
                  {o.id.slice(0, 8)}
                </span>
                <span className="ml-auto font-mono text-[13px] text-ink-100">
                  {money(o.totalCents)}
                </span>
                <span className="w-full text-[11px] text-ink-500 sm:w-auto">
                  {new Date(o.placedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-5">
        <UnderTheHood>
          <p>
            <strong className="font-medium text-ink-200">The store is Tier 2: live, never
            versioned.</strong> <code className="font-mono text-ink-300">products</code>,{" "}
            <code className="font-mono text-ink-300">product_variants</code>,{" "}
            <code className="font-mono text-ink-300">orders</code> and{" "}
            <code className="font-mono text-ink-300">customers</code> have no revision tables and
            never appear in a release manifest. Restoring an older design cannot un-place an order
            or resurrect a deleted product.
          </p>
          <p>
            <strong className="font-medium text-ink-200">Prices are snapshotted onto the
            order.</strong> <code className="font-mono text-ink-300">order_line_items</code> stores{" "}
            <code className="font-mono text-ink-300">price_at_purchase_cents</code> instead of
            joining back to the variant, because changing a price today must never rewrite what
            somebody paid last month.
          </p>
          <p>
            <strong className="font-medium text-ink-200">Deletes are soft, and announced
            first.</strong> Removing a product reads{" "}
            <code className="font-mono text-ink-300">release_dependencies</code> in reverse to list
            every release built while it existed, sets{" "}
            <code className="font-mono text-ink-300">deleted_at</code>, and leaves those frozen
            pages rendering a visible placeholder — degraded, not broken.
          </p>
        </UnderTheHood>
      </div>
    </AppShell>
  );
}
