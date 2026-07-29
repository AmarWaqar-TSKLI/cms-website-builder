import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser, sitesForUser } from "@/lib/auth";
import { LinkBtn } from "@/components/dashboard/dash-ui";
import { FormsManager } from "@/components/dashboard/FormsManager";

export const dynamic = "force-dynamic";

/**
 * The forms inbox.
 *
 * Everything visitors sent through a Contact or Newsletter block. Guarded like
 * the rest of the dashboard: resolved against the session and scoped to a site
 * this user's organisation owns. Submissions are Tier-2 — read here, never
 * versioned, never pinned by a release.
 */
export default async function FormsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard/forms");

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
            There is no site in the database yet. Create the demo site and your form messages appear
            here.
          </p>
          <pre className="mt-4 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-left font-mono text-[11.5px] text-ink-200">
            make seed
          </pre>
        </div>
      </main>
    );
  }

  const submissions = await prisma.formSubmission.findMany({
    where: { siteId: site.id },
    orderBy: { createdAt: "desc" },
    take: 300,
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
          <LinkBtn href="/dashboard/media" size="sm" variant="quiet">
            Images
          </LinkBtn>
          <LinkBtn href={`/s/${site.slug}`} external size="sm" variant="quiet">
            View live site ↗
          </LinkBtn>
        </nav>
      </div>

      <header className="mb-6">
        <h1 className="display text-[28px] text-ink-100 sm:text-[32px]">Forms</h1>
        <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-ink-300">
          Messages people send through your Contact and Newsletter blocks land here. They are kept
          separately from your pages, so going back to an older design never loses one.
        </p>
      </header>

      <FormsManager
        siteId={site.id}
        initial={submissions.map((s) => ({
          id: s.id,
          formKey: s.formKey,
          formName: s.formName,
          data: s.data,
          email: s.email,
          readAt: s.readAt?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
