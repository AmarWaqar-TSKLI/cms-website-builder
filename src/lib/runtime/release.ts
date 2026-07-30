/**
 * THE RUNTIME'S READ PATH, and the argument for the whole architecture.
 *
 * Serving a page is two lookups with deliberately opposite treatments:
 *
 *   1. WHICH release is this site serving?  One string, mutable, moved by a
 *      different process. Read fresh every time — see below.
 *
 *   2. WHAT is in that release?  Pages, components, frozen product data.
 *      Large, and IMMUTABLE — so it is cached forever and never invalidated.
 *      There is no invalidation code for it because no event could require any.
 *
 * That asymmetry is what makes rollback free. Rolling back purges nothing, warms
 * nothing and rebuilds nothing: it moves one pointer, and the previous release's
 * cache entries — here, and in a CDN if one were in front — are still exactly
 * where they were. The old version is not restored; it was never evicted.
 *
 * The contrast worth saying out loud: a CMS that caches rendered pages by URL
 * must purge on every publish, and cannot roll back without a second purge and a
 * cold cache — and the cost of both grows with the size of the site. Keying on
 * an immutable release id deletes the problem instead of managing it.
 */
import { prisma } from "../db";
import { asLayout, asTokens } from "../theme";
import { domainMatchCandidates } from "../domains";
import { displayNameOf } from "../shared-components";
import type {
  ComponentBody,
  PageBody,
  PageNode,
  ResolvedComponent,
  ThemeLayout,
  ThemeTokens,
} from "../registry/types";
import type { FrozenTierTwo } from "./snapshot";

export interface LoadedPage {
  id: string;
  path: string;
  title: string;
  root: PageNode[];
  revisionId: string;
}

export interface LoadedRelease {
  id: string;
  versionNo: number;
  siteId: string;
  siteName: string;
  siteSlug: string;
  createdAt: string;
  tokens: ThemeTokens;
  layout: ThemeLayout;
  /** Keyed by normalised path: "/", "/about". */
  pages: Record<string, LoadedPage>;
  components: Record<string, ResolvedComponent>;
  data: FrozenTierTwo;
}

/** "/about/", "about" and "/about" all name the same page. */
export function normalisePath(input: string): string {
  const trimmed = (input ?? "").trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The immutable cache. No eviction policy beyond a size cap, no invalidation.
//
// In one process this is a Map. At real scale it is Redis or a CDN, and the
// important property is unchanged: the key is content-addressed, so two servers
// can never disagree and a stale read is impossible by construction.
// ─────────────────────────────────────────────────────────────────────────────
const RELEASE_CACHE = new Map<string, LoadedRelease>();
const RELEASE_CACHE_MAX = 64;

export function releaseCacheSize(): number {
  return RELEASE_CACHE.size;
}

/** Test seam only. Production has no reason to ever call this. */
export function __clearReleaseCache() {
  RELEASE_CACHE.clear();
}

export async function loadRelease(releaseId: string): Promise<LoadedRelease | null> {
  const hit = RELEASE_CACHE.get(releaseId);
  if (hit) return hit;

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { site: true, items: true, frozenData: true },
  });
  if (!release) return null;

  // A release without frozen data was never finished by a build. Refusing to
  // render it is deliberate: resolving Tier-2 here instead would mean the page
  // showed whatever prices happen to be current, which is exactly the
  // non-determinism release_data exists to remove.
  if (!release.frozenData) return null;

  const pageItems = release.items.filter((i) => i.entityType === "page");
  const componentItems = release.items.filter((i) => i.entityType === "component");
  const themeItem = release.items.find((i) => i.entityType === "theme");

  const [pageRevisions, componentRevisions, themeRevision] = await Promise.all([
    prisma.pageRevision.findMany({
      where: { id: { in: pageItems.map((i) => i.revisionId) } },
      include: { page: true },
    }),
    componentItems.length
      ? prisma.componentRevision.findMany({
          where: { id: { in: componentItems.map((i) => i.revisionId) } },
          include: { component: true },
        })
      : Promise.resolve([]),
    themeItem
      ? prisma.themeRevision.findUnique({ where: { id: themeItem.revisionId } })
      : Promise.resolve(null),
  ]);

  const pages: Record<string, LoadedPage> = {};
  for (const revision of pageRevisions) {
    const path = normalisePath(revision.page.path);
    pages[path] = {
      id: revision.pageId,
      path,
      title: revision.page.title,
      root: ((revision.body as unknown as PageBody)?.root ?? []) as PageNode[],
      revisionId: revision.id,
    };
  }

  const components: Record<string, ResolvedComponent> = {};
  for (const revision of componentRevisions) {
    components[revision.componentId] = {
      id: revision.componentId,
      name: displayNameOf(revision.component),
      root: ((revision.body as unknown as ComponentBody)?.root ?? []) as PageNode[],
      revisionId: revision.id,
      // Deliberately never `missing`: the release pinned this revision, and a
      // later soft-delete of the component cannot reach back and change what an
      // already-published release renders. See build.ts for the full argument.
      missing: false,
    };
  }

  const loaded: LoadedRelease = {
    id: release.id,
    versionNo: release.versionNo,
    siteId: release.siteId,
    siteName: release.site.name,
    siteSlug: release.site.slug,
    createdAt: release.createdAt.toISOString(),
    tokens: asTokens(themeRevision?.tokens),
    layout: asLayout(themeRevision?.layout),
    pages,
    components,
    data: release.frozenData.data as unknown as FrozenTierTwo,
  };

  if (RELEASE_CACHE.size >= RELEASE_CACHE_MAX) {
    // Oldest insertion wins eviction. Correctness does not depend on this — a
    // miss costs one query, never a wrong answer, because the key is the content.
    const oldest = RELEASE_CACHE.keys().next().value;
    if (oldest) RELEASE_CACHE.delete(oldest);
  }
  RELEASE_CACHE.set(releaseId, loaded);

  return loaded;
}

// ─────────────────────────────────────────────────────────────────────────────
// The mutable pointer. One string per site, and the ONLY thing that is ever
// invalidated anywhere in the serving path.
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveSite {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  liveReleaseId: string | null;
}

/**
 * The pointer is read fresh on every request, and deliberately not cached.
 *
 * It is tempting to cache it — it is one string, read on every page view. The
 * reason not to is that it is the ONE mutable thing in this path, and it is
 * moved by a different process: the build worker flips `live_release_id` when a
 * release goes live. An in-process cache here would mean the app kept serving
 * the previous release until some TTL expired, which is a staleness bug that
 * gets worse the more app instances you run.
 *
 * So the split is: the one mutable value costs one indexed primary-key lookup
 * per request, and everything expensive — the pages, the components, the frozen
 * product data — is content-addressed and cached forever. Trading a trivial
 * query for the complete absence of cross-process invalidation is a good trade,
 * and it is only available because releases are immutable.
 *
 * A CDN in front of this changes nothing about the argument: it would key on the
 * release id too, and this lookup is what tells it which one.
 */

const SITE_FIELDS = {
  id: true,
  name: true,
  slug: true,
  customDomain: true,
  liveReleaseId: true,
} as const;

export async function siteBySlug(slug: string): Promise<LiveSite | null> {
  return prisma.site.findUnique({ where: { slug }, select: SITE_FIELDS });
}

/**
 * Custom domain routing. The mechanism is real: an incoming Host header matched
 * against sites.custom_domain. Only DNS and TLS are out of scope — the port is
 * stripped so "acme.test:3000" matches "acme.test", and apex/www are treated as
 * the same site (registering golotto.com also serves www.golotto.com).
 */
export async function siteByHost(host: string): Promise<LiveSite | null> {
  return prisma.site.findFirst({
    where: { customDomain: { in: domainMatchCandidates(host) } },
    select: SITE_FIELDS,
  });
}
