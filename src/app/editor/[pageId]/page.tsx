import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { asTokens } from "@/lib/theme";
import type {
  ModuleName,
  PageBody,
  RenderContext,
  ResolvedCollection,
  ResolvedMedia,
  ResolvedProduct,
} from "@/lib/registry/types";
import { EditorShell } from "@/components/editor/EditorShell";

export const dynamic = "force-dynamic";

const EMPTY: PageBody = { version: 1, root: [] };

export default async function EditorPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;

  const page = await prisma.page.findFirst({
    where: { id: pageId, deletedAt: null },
    include: {
      draft: true,
      site: {
        include: {
          modules: true,
          themes: { include: { revisions: true } },
          pages: { where: { deletedAt: null }, orderBy: { path: "asc" } },
        },
      },
    },
  });
  if (!page) notFound();

  const site = page.site;
  const theme = site.themes[0];
  const themeRevision = theme?.currentRevisionId
    ? theme.revisions.find((r) => r.id === theme.currentRevisionId)
    : theme?.revisions.sort((a, b) => b.versionNo - a.versionNo)[0];

  // Resolve live data exactly as the build worker will, so the canvas shows the
  // same thing the artifact will contain.
  const [productRows, collectionRows, mediaRows] = await Promise.all([
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

  const ctx: RenderContext = {
    siteId: site.id,
    siteName: site.name,
    releaseId: "draft",
    runtimeApi: process.env.NEXT_PUBLIC_RUNTIME_API || "http://localhost:3000",
    tokens: asTokens(themeRevision?.tokens),
    products,
    collections,
    media,
    editing: true,
  };

  return (
    <EditorShell
      page={{ id: page.id, path: page.path, title: page.title }}
      site={{ id: site.id, name: site.name, slug: site.slug }}
      body={(page.draft?.body as unknown as PageBody) ?? EMPTY}
      lockVersion={page.draft?.lockVersion ?? 0}
      modules={site.modules.map((m) => m.module as ModuleName)}
      ctx={ctx}
      refOptions={{
        collection: collectionRows.map((c) => ({ value: c.id, label: c.title })),
        product: productRows.map((p) => ({ value: p.id, label: p.title })),
        media: mediaRows.map((m, i) => ({ value: m.id, label: `Image ${i + 1}` })),
        post: [],
      }}
      siblings={site.pages.map((p) => ({ id: p.id, path: p.path, title: p.title }))}
    />
  );
}
