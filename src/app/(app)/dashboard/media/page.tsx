import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser, sitesForUser } from "@/lib/auth";
import { LinkBtn } from "@/components/dashboard/dash-ui";
import { MediaManager } from "@/components/dashboard/MediaManager";

export const dynamic = "force-dynamic";

/**
 * The image library.
 *
 * Every picture the site owns, in one place, so you can upload and tidy them up
 * outside the editor. Guarded like the dashboard: resolved against the session
 * and scoped to a site this user's organisation actually owns.
 */
export default async function MediaPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/media");

  const reachable = await sitesForUser(user.id);
  const site = reachable[0]
    ? await prisma.site.findUnique({ where: { id: reachable[0].id } })
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

  const media = await prisma.media.findMany({
    where: { siteId: site.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1140px] px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
      <div className="mb-5 flex items-center justify-between gap-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-400 transition-colors hover:text-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flux-400"
        >
          ← {site.name}
        </Link>
        <nav className="flex items-center gap-1">
          <LinkBtn href="/dashboard/products" size="sm" variant="quiet">
            Store
          </LinkBtn>
          <LinkBtn href={`/s/${site.slug}`} external size="sm" variant="quiet">
            View live site ↗
          </LinkBtn>
        </nav>
      </div>

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
    </main>
  );
}
