import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser, sitesForUser } from "@/lib/auth";
import { storeSiteId } from "@/lib/store-site";
import { AppShell } from "@/components/dashboard/AppShell";
import { MediaManager } from "@/components/dashboard/MediaManager";

export const dynamic = "force-dynamic";

/**
 * The image library.
 *
 * Every picture the site owns, in one place, so you can upload and tidy them up
 * outside the editor. Guarded like the dashboard: resolved against the session
 * and scoped to a site this user's organisation actually owns.
 */
export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/media");

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
            There is no site in the database yet. Create the demo site and your images appear here.
          </p>
          <pre className="mt-4 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-left font-mono text-[11.5px] text-ink-200">
            make seed
          </pre>
        </div>
      </main>
    );
  }

  // A branch shares its parent's library (store-site.ts) — media is Tier-2.
  const media = await prisma.media.findMany({
    where: {
      siteId: site.parentSiteId ? await storeSiteId(site.id) : site.id,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
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
        <h1 className="display text-[28px] text-ink-100 sm:text-[32px]">Images</h1>
        <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-ink-300">
          Every picture your site can use. Upload your own here, then choose them while editing a
          page. Images are stored with your site, so a downloaded copy of your site still shows them
          with nothing else to set up.
        </p>
      </header>

      <MediaManager
        siteId={site.id}
        initial={media.map((m) => ({
          id: m.id,
          url: m.storageKey,
          filename: m.filename,
          alt: m.alt,
          sizeBytes: m.sizeBytes,
          width: m.width,
          height: m.height,
        }))}
      />
    </AppShell>
  );
}
