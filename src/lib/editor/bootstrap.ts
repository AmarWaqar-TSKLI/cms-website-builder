/**
 * The data both editor routes need.
 *
 * A page and a shared component are edited by the same screen, so they need the
 * same bootstrap: the site's theme, its live Tier-2 data resolved exactly as the
 * build worker will resolve it, and every symbol's current draft tree. Building
 * that twice in two route files would be two chances to drift apart, and drift
 * here shows up as "the canvas didn't match the published page".
 */
import { prisma } from "../db";
import { asLayout, asTokens } from "../theme";
import { storeSiteId } from "../store-site";
import { directComponentRefs } from "../shared-components";
import { displayNameOf } from "../shared-components";
import type {
  ComponentBody,
  ModuleName,
  PageNode,
  RenderContext,
  ResolvedCollection,
  ResolvedMedia,
  ResolvedPost,
  ResolvedProduct,
  ResolvedComponent,
  ThemeLayout,
} from "../registry/types";
import type { RefOptions } from "@/components/editor/Properties";

export interface EditorContext {
  site: { id: string; name: string; slug: string };
  modules: ModuleName[];
  ctx: RenderContext;
  layout: ThemeLayout;
  refOptions: RefOptions;
  components: ResolvedComponent[];
  /** Every component, named or not — the expansion map the canvas needs. */
  allComponents: ResolvedComponent[];
  /**
   * Components referenced by more than one page — the ones where an edit has
   * consequences beyond the page you are on. Everything else is just a block.
   */
  sharedIds: string[];
  siblings: { id: string; path: string; title: string }[];
}

export async function loadEditorContext(siteId: string): Promise<EditorContext | null> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      modules: true,
      themes: { include: { revisions: true } },
      pages: { where: { deletedAt: null }, orderBy: { path: "asc" } },
    },
  });
  if (!site) return null;

  const theme = site.themes[0];
  const themeRevision = theme?.currentRevisionId
    ? theme.revisions.find((r) => r.id === theme.currentRevisionId)
    : theme?.revisions.sort((a, b) => b.versionNo - a.versionNo)[0];

  // Tier-2 comes from the family's shared store (store-site.ts): a branch edits
  // its own design but references its PARENT's products, media and posts — the
  // same records the freeze step will resolve at publish. Without this, every
  // ProductGrid on a branch rendered "(deleted product)" for a perfectly live
  // catalogue. Design reads below (components) stay on site.id.
  const storeId = site.parentSiteId ? await storeSiteId(site.id) : site.id;

  const [productRows, collectionRows, mediaRows, componentRows, postRows] = await Promise.all([
    prisma.product.findMany({
      where: { siteId: storeId },
      include: { variants: { orderBy: { priceCents: "asc" }, take: 1 } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.collection.findMany({
      where: { siteId: storeId },
      include: { products: { orderBy: { position: "asc" } } },
      orderBy: { title: "asc" },
    }),
    prisma.media.findMany({ where: { siteId: storeId }, orderBy: { createdAt: "asc" } }),
    // DRAFT bodies, not revisions. The editor previews what will be published
    // next, so a header you changed five seconds ago shows on every page that
    // uses it immediately — the build reads pinned revisions instead.
    prisma.component.findMany({
      where: { siteId: site.id, deletedAt: null },
      include: { draft: true },
      orderBy: { name: "asc" },
    }),
    // Only PUBLISHED posts can be featured on a page — an unpublished one would
    // freeze as `missing`, so offering it would only invite that surprise.
    prisma.post.findMany({
      where: { siteId: storeId, status: "published", deletedAt: null },
      orderBy: { publishedAt: "desc" },
    }),
  ]);

  const products: Record<string, ResolvedProduct> = {};
  for (const p of productRows) {
    products[p.id] = {
      id: p.id,
      title: p.title,
      description: p.description,
      imageUrl: p.imageUrl,
      priceCents: p.variants[0]?.priceCents ?? 0,
      variantId: p.variants[0]?.id ?? null,
      missing: p.deletedAt !== null || p.status === "archived",
    };
  }

  const collections: Record<string, ResolvedCollection> = {};
  for (const c of collectionRows) {
    collections[c.id] = {
      id: c.id,
      title: c.title,
      handle: c.handle,
      productIds: c.products.map((cp) => cp.productId),
      missing: c.deletedAt !== null,
    };
  }

  const media: Record<string, ResolvedMedia> = {};
  for (const m of mediaRows) {
    media[m.id] = { id: m.id, url: m.storageKey, alt: m.alt ?? "", missing: m.deletedAt !== null };
  }

  const posts: Record<string, ResolvedPost> = {};
  for (const p of postRows) {
    posts[p.id] = {
      id: p.id,
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      // The canvas only ever renders the LIST, never a post's body, so the body
      // is left empty here — the detail page is a hosted route, not a block.
      body: "",
      publishedAt: p.publishedAt?.toISOString() ?? null,
      missing: false,
    };
  }

  // Which components more than one page points at. One scan of the drafts, done
  // when the editor opens, and it decides the single most important behaviour on
  // the canvas: whether editing a block edits it, or overrides it.
  const pageDrafts = await prisma.pageDraft.findMany({
    where: { page: { siteId: site.id, deletedAt: null } },
  });
  const refCount = new Map<string, number>();
  for (const draft of pageDrafts) {
    const body = draft.body as unknown as { root?: PageNode[] } | undefined;
    for (const id of directComponentRefs(body?.root ?? [])) {
      refCount.set(id, (refCount.get(id) ?? 0) + 1);
    }
  }
  // A component placed inside another component is shared too: editing it would
  // change every page that uses the parent.
  for (const c of componentRows) {
    const body = c.draft?.body as unknown as { root?: PageNode[] } | undefined;
    for (const id of directComponentRefs(body?.root ?? [])) {
      refCount.set(id, (refCount.get(id) ?? 0) + 1);
    }
  }
  // Named components are treated as shared even at one use: naming one is how a
  // person says "this is meant to be reused", and it should behave that way from
  // the first page rather than changing behaviour on the second.
  const sharedIds = componentRows
    .filter((c) => (refCount.get(c.id) ?? 0) > 1 || !!c.name)
    .map((c) => c.id);

  const componentList: ResolvedComponent[] = componentRows.map((c) => ({
    id: c.id,
    name: displayNameOf(c),
    root: ((c.draft?.body as unknown as ComponentBody) ?? { version: 1, root: [] }).root ?? [],
  }));

  // The palette lists only NAMED components. Every block on every page is a
  // component record now, and listing all of them would be a wall of noise — a
  // name is exactly the signal that someone intends this one to be reused.
  const paletteComponents = componentList.filter((c) =>
    componentRows.find((r) => r.id === c.id && r.name),
  );

  const components: Record<string, ResolvedComponent> = {};
  for (const c of componentList) components[c.id] = c;

  return {
    site: { id: site.id, name: site.name, slug: site.slug },
    modules: site.modules.map((m) => m.module as ModuleName),
    layout: asLayout(themeRevision?.layout),
    components: paletteComponents,
    allComponents: componentList,
    sharedIds,
    siblings: site.pages.map((p) => ({ id: p.id, path: p.path, title: p.title })),
    refOptions: {
      collection: collectionRows.map((c) => ({ value: c.id, label: c.title })),
      product: productRows.map((p) => ({ value: p.id, label: p.title })),
      media: mediaRows.map((m, i) => ({ value: m.id, label: m.filename ?? `Image ${i + 1}` })),
      post: postRows.map((p) => ({ value: p.id, label: p.title })),
      component: componentList.map((c) => ({ value: c.id, label: c.name })),
    },
    ctx: {
      siteId: site.id,
      siteName: site.name,
      releaseId: "draft",
      runtimeApi: process.env.NEXT_PUBLIC_RUNTIME_API || "http://localhost:3000",
      tokens: asTokens(themeRevision?.tokens),
      products,
      collections,
      media,
      posts,
      components,
      editing: true,
    },
  };
}
