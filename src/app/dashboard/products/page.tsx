import Link from "next/link";
import { prisma } from "@/lib/db";
import { Note } from "@/components/ui";
import { ProductManager } from "@/components/dashboard/ProductManager";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const site = await prisma.site.findFirst({
    orderBy: { createdAt: "asc" },
    include: { collections: { where: { deletedAt: null }, orderBy: { title: "asc" } } },
  });
  if (!site) return <main className="p-10">No site — run the seed.</main>;

  const orders = await prisma.order.findMany({
    where: { siteId: site.id },
    orderBy: { placedAt: "desc" },
    take: 8,
    include: { lineItems: true },
  });

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <header className="mb-8">
        <Link href="/dashboard" className="text-[13px] text-ink-400 hover:text-ink-100">
          ← {site.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Commerce</h1>
        <Note className="mt-1">
          Tier 2. None of this is versioned, none of it appears in a release manifest, and none
          of it rolls back when the site&apos;s appearance does.
        </Note>
      </header>

      <ProductManager siteId={site.id} collectionId={site.collections[0]?.id ?? null} />

      <section className="mt-6 rounded-2xl border border-ink-700 bg-ink-900/80 p-5">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
          Orders
        </div>
        {orders.length === 0 ? (
          <Note>
            No orders yet. Open the live site, add something to the cart and check out — a static
            file on disk will write a row here without changing by a single byte.
          </Note>
        ) : (
          <ul className="space-y-1.5">
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-[12px]"
              >
                <code className="font-mono text-[11px] text-ink-400">{o.id.slice(0, 8)}</code>
                <span className="text-ink-300">
                  {o.lineItems.length} line{o.lineItems.length === 1 ? "" : "s"}
                </span>
                <span className="ml-auto font-mono text-ink-100">
                  ${(o.totalCents / 100).toFixed(2)}
                </span>
                <span className="text-[11px] text-ink-500">
                  {new Date(o.placedAt).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Note className="mt-3">
          Line items store <code className="font-mono text-ink-300">price_at_purchase_cents</code>{" "}
          rather than joining to the variant. Changing a price today must not rewrite what
          someone paid last month.
        </Note>
      </section>
    </main>
  );
}
