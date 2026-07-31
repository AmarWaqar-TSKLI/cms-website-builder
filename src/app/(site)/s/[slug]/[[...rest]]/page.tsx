/**
 * /s/:slug/*  — the hosted destination.
 *
 * A React Server Component, not a file read. The request path is:
 *
 *   slug → site (pointer cache) → live_release_id → release (immutable cache)
 *        → render the pinned revisions
 *
 * There is no filesystem access here at all. The old version of this route read
 * an HTML file that a worker had written; hosting no longer depends on a disk
 * being present, which is what makes running more than one of these possible.
 */
import { resolveRequest, renderResolved } from "@/lib/runtime/render-page";
import { siteBySlug } from "@/lib/runtime/release";

// Rendering is cheap and correctness comes from the immutable release cache, not
// from Next's route cache. Keeping this dynamic means a rollback is visible on
// the very next request rather than whenever a route cache decides.
export const dynamic = "force-dynamic";

// No generateMetadata on purpose. It is an async boundary, and Next streams
// metadata that has not resolved by the time the shell flushes — so the SAME
// release renders with a Suspense placeholder on a cold cache and inline on a
// warm one. Different bytes for identical input, which is precisely what this
// architecture promises never happens.
//
// The page emits its own <title> and provenance <meta> tags instead. React 19
// hoists them into <head>, and they resolve with the rest of the tree.

type Params = Promise<{ slug: string; rest?: string[] }>;

export default async function HostedSitePage({ params }: { params: Params }) {
  const { slug, rest } = await params;
  // Served under /s/<slug>, so every same-site link must carry that prefix.
  // (On a custom domain the site is the root and the prefix is empty.)
  return renderResolved(await resolveRequest(await siteBySlug(slug), rest), `/s/${slug}`);
}
