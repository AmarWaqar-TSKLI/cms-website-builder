import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Dot, Mono, Note, SectionLabel } from "@/components/ui";
import { Releases } from "@/components/dashboard/Releases";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const site = await prisma.site.findFirst({
    orderBy: { createdAt: "asc" },
    include: {
      org: true,
      modules: true,
      pages: { where: { deletedAt: null }, orderBy: { path: "asc" }, include: { draft: true, _count: { select: { revisions: true } } } },
      liveRelease: true,
      _count: { select: { releases: true, products: true, orders: true } },
    },
  });

  if (!site) {
    return (
      <main className="grid min-h-screen place-items-center p-8">
        <div className="max-w-md text-center">
          <h1 className="mb-3 text-xl font-semibold">No site found</h1>
          <Note>
            The database is empty. Run <Mono className="text-ink-200">make seed</Mono> (or{" "}
            <Mono className="text-ink-200">npm run seed</Mono>) to create the demo site.
          </Note>
        </div>
      </main>
    );
  }

  const live = site.liveRelease;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{site.name}</h1>
            {live ? (
              <Badge tone="live">
                <Dot tone="live" /> live · v{live.versionNo}
              </Badge>
            ) : (
              <Badge tone="warn">not published</Badge>
            )}
          </div>
          <Note>
            {site.org.name} · <Mono>{site.slug}</Mono> ·{" "}
            {site.modules.map((m) => m.module).join(", ") || "engine only"}
          </Note>
        </div>

        <nav className="flex flex-wrap gap-2">
          <NavLink href="/dashboard/products">Products</NavLink>
          <NavLink href="/walkthrough">Walkthrough</NavLink>
          <NavLink href="/">Landing</NavLink>
        </nav>
      </header>

      {/* One release id, three destinations. Shown together because the equality
          is the claim. */}
      <section className="mb-6 rounded-2xl border border-ink-700 bg-ink-900/80 p-5">
        <SectionLabel>One build, three destinations</SectionLabel>
        {live ? (
          <>
            <Note className="mb-4">
              All three come from release <Mono className="text-ink-200">{live.id}</Mono>. The
              export routes copy the artifact; they do not re-render it.
            </Note>
            <div className="grid gap-3 sm:grid-cols-3">
              <Destination
                title="Hosted"
                detail="Served from disk by this app"
                href={`/s/${site.slug}`}
                cta="Open"
                external
              />
              <Destination
                title="Static zip"
                detail="Any static host, or file://"
                href={`/api/releases/${live.id}/export/static`}
                cta="Download"
              />
              <Destination
                title="Container"
                detail="nginx + Dockerfile + compose"
                href={`/api/releases/${live.id}/export/container`}
                cta="Download"
              />
            </div>
            {site.customDomain && (
              <Note className="mt-3">
                Custom domain routing is live too:{" "}
                <Link className="text-flux-300 underline underline-offset-2" href={`/?host=${site.customDomain}`}>
                  /?host={site.customDomain}
                </Link>{" "}
                matches the Host header against <Mono>sites.custom_domain</Mono> and serves the
                same bytes. Only DNS and SSL are out of scope.
              </Note>
            )}
          </>
        ) : (
          <Note>
            Nothing is published yet, so there is no artifact and nothing to export. Open a page
            and publish to create v1.
          </Note>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-ink-700 bg-ink-900/80">
          <div className="p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <div>
                <SectionLabel>Pages</SectionLabel>
                <Note>
                  A page row holds identity only — no content column. Bodies live in one draft
                  and many revisions.
                </Note>
              </div>
              <Mono className="text-ink-500">pages</Mono>
            </div>

            <ul className="space-y-2">
              {site.pages.map((page) => (
                <li key={page.id}>
                  <Link
                    href={`/editor/${page.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-950 p-3 transition-colors hover:border-flux-500/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Mono className="text-[12px] text-ink-100">{page.path}</Mono>
                        <span className="text-[12px] text-ink-400">{page.title}</span>
                      </div>
                      <div className="mt-1 flex gap-3 text-[11px] text-ink-500">
                        <span>
                          {page._count.revisions} revision{page._count.revisions === 1 ? "" : "s"}
                        </span>
                        <span>{page.draft ? "1 draft row" : "no draft"}</span>
                        {page.draft && <span>lock_version {page.draft.lockVersion}</span>}
                      </div>
                    </div>
                    <span className="text-[12px] text-ink-500 transition-colors group-hover:text-flux-300">
                      Edit →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="releases" value={site._count.releases} />
              <Stat label="products" value={site._count.products} />
              <Stat label="orders" value={site._count.orders} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-ink-700 bg-ink-900/80">
          <Releases siteId={site.id} siteSlug={site.slug} />
        </section>
      </div>
    </main>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-ink-700 px-3 py-1.5 text-[12px] text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-100"
    >
      {children}
    </Link>
  );
}

function Destination({
  title,
  detail,
  href,
  cta,
  external,
}: {
  title: string;
  detail: string;
  href: string;
  cta: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="group rounded-xl border border-ink-800 bg-ink-950 p-4 transition-colors hover:border-flux-500/40"
    >
      <div className="text-[13px] font-medium text-ink-100">{title}</div>
      <div className="mt-0.5 text-[11px] text-ink-500">{detail}</div>
      <div className="mt-3 text-[12px] text-flux-300 transition-transform group-hover:translate-x-0.5">
        {cta} →
      </div>
    </a>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950 p-3 text-center">
      <div className="font-mono text-lg text-ink-100">{value}</div>
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </div>
    </div>
  );
}
