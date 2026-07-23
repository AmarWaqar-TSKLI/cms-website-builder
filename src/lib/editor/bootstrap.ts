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
import type {
  ComponentBody,
  ModuleName,
  RenderContext,
  ResolvedCollection,
  ResolvedMedia,
  ResolvedProduct,
  ResolvedSharedComponent,
  ThemeLayout,
} from "../registry/types";
import type { RefOptions } from "@/components/editor/Properties";

export interface EditorContext {
  site: { id: string; name: string; slug: string };
  modules: ModuleName[];
  ctx: RenderContext;
  layout: ThemeLayout;
  refOptions: RefOptions;
  components: ResolvedSharedComponent[];
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

  const [productRows, collectionRows, mediaRows, componentRows] = await Promise.all([
    prisma.product.findMany({
      where: { siteId: site.id },
      include: { variants: { orderBy: { priceCents: "asc" }, take: 1 } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.collection.findMany({
      where: { siteId: site.id },
      include: { products: { orderBy: { position: "asc" } } },
      orderBy: { title: "asc" },
    }),
    prisma.media.findMany({ where: { siteId: site.id }, orderBy: { createdAt: "asc" } }),
    // DRAFT bodies, not revisions. The editor previews what will be published
    // next, so a header you changed five seconds ago shows on every page that
    // uses it immediately — the build reads pinned revisions instead.
    prisma.sharedComponent.findMany({
      where: { siteId: site.id, deletedAt: null },
      include: { draft: true },
      orderBy: { name: "asc" },
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
    media[m.id] = { id: m.id, url: m.storageKey, alt: "", missing: m.deletedAt !== null };
  }

  const componentList: ResolvedSharedComponent[] = componentRows.map((c) => ({
    id: c.id,
    name: c.name,
    root: ((c.draft?.body as unknown as ComponentBody) ?? { version: 1, root: [] }).root ?? [],
  }));

  const components: Record<string, ResolvedSharedComponent> = {};
  for (const c of componentList) components[c.id] = c;

  return {
    site: { id: site.id, name: site.name, slug: site.slug },
    modules: site.modules.map((m) => m.module as ModuleName),
    layout: asLayout(themeRevision?.layout),
    components: componentList,
    siblings: site.pages.map((p) => ({ id: p.id, path: p.path, title: p.title })),
    refOptions: {
      collection: collectionRows.map((c) => ({ value: c.id, label: c.title })),
      product: productRows.map((p) => ({ value: p.id, label: p.title })),
      media: mediaRows.map((m, i) => ({ value: m.id, label: `Image ${i + 1}` })),
      post: [],
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
      components,
      editing: true,
    },
  };
}
