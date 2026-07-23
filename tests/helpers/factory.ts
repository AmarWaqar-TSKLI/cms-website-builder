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
import { createSession } from "../../src/lib/auth";

export interface TestSite {
  /** A ready-made session cookie for this site's owner. */
  cookie: string;
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
    data: {
      email: `${label}-${suffix}@test.local`,
      name: `${label} tester`,
      // Not a usable password. Integration tests call the library directly and
      // never sign in; the auth test suite makes its own users with real hashes.
      passwordHash: "scrypt$invalid",
    },
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
        node("Hero", { headline: "Version one", bgImage: media.id }),
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
    cookie: await sessionCookie(user.id),
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

/**
 * Provenance, read from the document rather than a response header.
 *
 * A React Server Component cannot set response headers, so the release a page
 * came from is stamped into the markup as a meta tag instead. That is arguably
 * the better place for it: the provenance now travels with the page — into a
 * saved copy, into an exported zip, into whatever a CDN cached — instead of
 * living on a response that gets thrown away.
 */
export function releaseIdOf(html: string): string | null {
  return /<meta name="cms:release-id" content="([^"]+)"/.exec(html)?.[1] ?? null;
}

/**
 * The document, with Next's hydration payload removed.
 *
 * Next streams the RSC payload to the browser as a series of
 * `<script>self.__next_f.push(...)</script>` calls, and splits it across those
 * script tags at boundaries that depend on how fast the server produced data.
 * Identical input can therefore yield the same document with its hydration
 * payload chunked differently — a few dozen bytes of framing, never a difference
 * in content.
 *
 * So the byte-identity claims in this suite are made about THIS: the actual
 * document a visitor sees, with the framework's transport stripped. That is the
 * honest form of the claim, and it is still the strong one — it is what a CDN
 * caches, what a browser renders, and what a rollback has to reproduce exactly.
 */
export function stableHtml(html: string): string {
  return html.replace(/<script>self\.__next_f\.push\([\s\S]*?\)<\/script>/g, "");
}

/**
 * A real session cookie for a test's user.
 *
 * Integration tests exercise HTTP endpoints, and those endpoints now require a
 * signed-in member of the site's organisation — which is the point. Rather than
 * weakening the guard for tests (a "skip auth in test mode" flag is how auth
 * bypasses ship), the tests get a genuine session row and a genuine cookie, and
 * go through exactly the same checks a browser would.
 */
export async function sessionCookie(userId: string): Promise<string> {
  const token = await createSession(userId, "integration-test");
  return `cms_session=${token}`;
}

/** Fetch with a session attached. Same signature as fetch, one extra header. */
export function asUser(cookie: string) {
  return (url: string, init: RequestInit = {}) =>
    fetch(url, { ...init, headers: { ...(init.headers ?? {}), cookie } });
}
