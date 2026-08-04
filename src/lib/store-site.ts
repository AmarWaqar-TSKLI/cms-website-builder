/**
 * Which site owns the LIVE (Tier-2) data a given site uses?
 *
 * A branch forks the DESIGN — pages, components, theme (branch.ts). The store is
 * deliberately not forked: products, media and posts are live business data
 * (D5), and two branches with two inventories would mean reconciling stock and
 * orders at merge time — exactly the complexity the tier split exists to avoid.
 * So a family of branches shares ONE catalogue: the root site's.
 *
 * Everything that reads or writes Tier-2 BY SITE ID resolves through here
 * first. Design reads (pages, components, themes, releases) never do. The
 * freeze step (runtime/snapshot.ts) resolves by record id, so it already works
 * across the family and needs nothing from this file.
 */
import { prisma } from "./db";

/**
 * Walk `parentSiteId` links to the root. Bounded and cycle-guarded: a branch of
 * a branch still resolves, while a data loop or absurd depth returns where the
 * walk stopped instead of hanging a request.
 */
export async function resolveStoreSiteId(
  siteId: string,
  parentOf: (id: string) => Promise<string | null>,
): Promise<string> {
  let current = siteId;
  const seen = new Set<string>([current]);
  for (let i = 0; i < 10; i++) {
    const parent = await parentOf(current);
    if (!parent || seen.has(parent)) return current;
    seen.add(parent);
    current = parent;
  }
  return current;
}

/** The site whose store this site uses: itself, or its root ancestor. */
export async function storeSiteId(siteId: string): Promise<string> {
  return resolveStoreSiteId(siteId, async (id) => {
    const row = await prisma.site.findUnique({
      where: { id },
      select: { parentSiteId: true },
    });
    return row?.parentSiteId ?? null;
  });
}
