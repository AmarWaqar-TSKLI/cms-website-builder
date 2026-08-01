import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser, sitesForUser } from "@/lib/auth";
import { AppShell } from "@/components/dashboard/AppShell";
import { BlogManager } from "@/components/dashboard/BlogManager";

export const dynamic = "force-dynamic";

/**
 * The blog.
 *
 * Write posts, keep them as drafts until they're ready, then publish. A
 * published post can be featured on any page with a "Blog posts" block. Guarded
 * like the rest of the dashboard.
 */
export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/blog");

  const { site: requestedSiteId } = await searchParams;
  const reachable = await sitesForUser(user.id);
  const targetId =
    requestedSiteId && reachable.some((s) => s.id === requestedSiteId)
      ? requestedSiteId
      : reachable[0]?.id;
  const site = targetId
    ? await prisma.site.findUnique({ where: { id: targetId }, include: { modules: true } })
    : null;

  if (!site) {
    return (
      <main className="grid min-h-screen place-items-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900/70 p-7 text-center">
          <h1 className="text-xl font-semibold tracking-tight">No site to show</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
            There is no site in the database yet. Create the demo site and your blog appears here.
          </p>
          <pre className="mt-4 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-left font-mono text-[11.5px] text-ink-200">
            make seed
          </pre>
        </div>
      </main>
    );
  }

  const blogOn = site.modules.some((m) => m.module === "blog");

  const posts = await prisma.post.findMany({
    where: { siteId: site.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { revisions: true } } },
  });

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
      <header className="mb-6">
        <h1 className="display text-[28px] text-ink-100 sm:text-[32px]">Blog</h1>
        <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-ink-300">
          Write posts here and publish the ones that are ready. To show them on your site, add a
          &ldquo;Blog posts&rdquo; block to any page and pick which posts it lists.
        </p>
      </header>

      {!blogOn && (
        <div className="mb-5 rounded-xl border border-warn-500/30 bg-warn-500/[0.07] px-4 py-3 text-[12.5px] leading-relaxed text-warn-500">
          The blog block won&rsquo;t appear in the editor until this site&rsquo;s blog is switched on.
          You can still write and publish posts here in the meantime.
        </div>
      )}

      <BlogManager
        siteId={site.id}
        initial={posts.map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          excerpt: p.excerpt,
          status: p.status,
          publishedAt: p.publishedAt?.toISOString() ?? null,
          revisionCount: p._count.revisions,
        }))}
      />
    </AppShell>
  );
}
