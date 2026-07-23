/**
 * The custom-domain destination.
 *
 * The edge middleware decides "this request arrived at a domain that is not the
 * app's own" and rewrites here; this route does the sites.custom_domain lookup.
 * Keeping the database out of the middleware is what lets it stay on the edge
 * runtime.
 *
 * Below the lookup, this is byte for byte the same code path as /s/:slug — same
 * release, same cache, same components. A site reached by its own domain is not
 * a different rendering mode.
 */
import { resolveRequest, renderResolved } from "@/lib/runtime/render-page";
import { siteByHost } from "@/lib/runtime/release";

export const dynamic = "force-dynamic";

// No generateMetadata on purpose. It is an async boundary, and Next streams
// metadata that has not resolved by the time the shell flushes — so the SAME
// release renders with a Suspense placeholder on a cold cache and inline on a
// warm one. Different bytes for identical input, which is precisely what this
// architecture promises never happens.
//
// The page emits its own <title> and provenance <meta> tags instead. React 19
// hoists them into <head>, and they resolve with the rest of the tree.

type Params = Promise<{ host: string; rest?: string[] }>;

export default async function CustomDomainPage({ params }: { params: Params }) {
  const { host, rest } = await params;
  return renderResolved(await resolveRequest(await siteByHost(decodeURIComponent(host)), rest));
}
