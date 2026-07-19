/**
 * Every integration test builds its OWN site: its own org, pages, products and
 * artifact directory. Nothing is shared, so tests never fight over the seeded
 * demo data and a failure points at one test rather than at ordering.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/db";
import { createNode } from "../../src/lib/registry";
import type { PageBody, PageNode } from "../../src/lib/registry/types";
import { DEFAULT_LAYOUT, DEFAULT_TOKENS } from "../../src/lib/theme";
import { toJson } from "../../src/lib/json";

export interface TestSite {
  siteId: string;
  slug: string;
  orgId: string;
  userId: string;
  homePageId: string;
  aboutPageId: string;
  collectionId: string;
  productIds: string[];
  variantIds: string[];
  mediaId: string;
}

let counter = 0;

export function node(type: string, props: Record<string, unknown> = {}): PageNode {
  counter += 1;
  const n = createNode(type, `t${counter}`);
  Object.assign(n.props, props);
  return n;
}

export const body = (root: PageNode[]): PageBody => ({ version: 1, root });

export async function createTestSite(label = "test"): Promise<TestSite> {
  const suffix = randomUUID().slice(0, 8);

  const org = await prisma.organization.create({ data: { name: `${label}-org-${suffix}` } });
  const user = await prisma.user.create({
    data: { email: `${label}-${suffix}@test.local`, passwordHash: "x" },
  });
  await prisma.membership.create({ data: { orgId: org.id, userId: user.id, role: "owner" } });

  const site = await prisma.site.create({
    data: {
      orgId: org.id,
      name: `${label} ${suffix}`,
      slug: `${label}-${suffix}`,
      customDomain: `${label}-${suffix}.test`,
    },
  });
  await prisma.siteModule.create({ data: { siteId: site.id, module: "commerce" } });

  const theme = await prisma.theme.create({ data: { siteId: site.id, name: "Test theme" } });
  const themeRev = await prisma.themeRevision.create({
    data: {
      themeId: theme.id,
      versionNo: 1,
      tokens: toJson(DEFAULT_TOKENS),
      layout: toJson(DEFAULT_LAYOUT),
    },
  });
  await prisma.theme.update({ where: { id: theme.id }, data: { currentRevisionId: themeRev.id } });

  const media = await prisma.media.create({
    data: {
      siteId: site.id,
      storageKey: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      mime: "image/svg+xml",
    },
  });

  const products = [];
  for (let i = 0; i < 3; i++) {
    products.push(
      await prisma.product.create({
        data: {
          siteId: site.id,
          title: `Product ${i + 1}`,
          description: `Test product ${i + 1}`,
          status: "active",
          variants: {
            create: { sku: `SKU-${suffix}-${i}`, priceCents: 1000 * (i + 1), inventoryQty: 100 },
          },
        },
        include: { variants: true },
      }),
    );
  }

  const collection = await prisma.collection.create({
    data: {
      siteId: site.id,
      title: "Featured",
      handle: "featured",
      products: { create: products.map((p, i) => ({ productId: p.id, position: i })) },
    },
  });

  const home = await prisma.page.create({
    data: { siteId: site.id, path: "/", title: "Home" },
  });
  const about = await prisma.page.create({
    data: { siteId: site.id, path: "/about", title: "About" },
  });

  await prisma.pageDraft.create({
    data: {
      pageId: home.id,
      lockVersion: 1,
      body: toJson(body([
        node("Hero", { headline: "Version one", background: media.id }),
        node("ProductGrid", { collection: collection.id, heading: "Featured" }),
      ])),
    },
  });
  await prisma.pageDraft.create({
    data: {
      pageId: about.id,
      lockVersion: 1,
      body: toJson(body([node("TextBlock", { heading: "About", body: "Version one." })])),
    },
  });

  return {
    siteId: site.id,
    slug: site.slug,
    orgId: org.id,
    userId: user.id,
    homePageId: home.id,
    aboutPageId: about.id,
    collectionId: collection.id,
    productIds: products.map((p) => p.id),
    variantIds: products.map((p) => p.variants[0].id),
    mediaId: media.id,
  };
}

/** Overwrite a draft the way autosave does. */
export async function setDraft(pageId: string, nodes: PageNode[]) {
  await prisma.pageDraft.update({
    where: { pageId },
    data: { body: toJson(body(nodes)), lockVersion: { increment: 1 } },
  });
}

export const APP_URL = process.env.APP_URL || "http://localhost:3000";

/** Integration tests that assert HTTP behaviour need the app running. */
export async function requireApp(): Promise<void> {
  try {
    const res = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) return;
  } catch {
    /* fall through */
  }
  throw new Error(
    `The app is not responding at ${APP_URL}. Start it with \`make up\` (or \`make dev\`) before running integration tests.`,
  );
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
