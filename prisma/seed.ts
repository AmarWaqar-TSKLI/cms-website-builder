/**
 * Seed: one org, one user, one site with two pages, a theme, a collection of
 * three products, commerce enabled.
 *
 * Idempotent by TRUNCATE — which also happens to be the only way to clear
 * page_revisions, because the append-only trigger rejects DELETE. Administrative
 * teardown is a deliberately different act from the application rewriting history.
 */
import { loadEnv } from "../src/lib/env";
loadEnv();

import { PrismaClient } from "@prisma/client";
import { createNode } from "../src/lib/registry";
import type { PageBody, PageNode } from "../src/lib/registry/types";
import { DEFAULT_LAYOUT, DEFAULT_TOKENS } from "../src/lib/theme";
import { toJson } from "../src/lib/json";

const prisma = new PrismaClient();

/**
 * Images are inline SVG data URIs rather than real uploads. FAKED: there is no
 * S3, no upload pipeline, no image processing. The upside is real — an exported
 * artifact opened from file:// renders completely, with no network at all.
 */
function svgDataUri(from: string, to: string, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="1200" height="900" fill="url(#g)"/>${
    label
      ? `
  <text x="600" y="470" font-family="Inter,sans-serif" font-size="54" font-weight="600"
        fill="rgba(255,255,255,.82)" text-anchor="middle">${label}</text>`
      : ""
  }
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const TABLES = [
  "post_tags", "tags", "post_revisions", "posts",
  "order_line_items", "orders", "customers",
  "collection_products", "collections", "product_variants", "products",
  "build_jobs", "release_dependencies", "release_items", "releases",
  "media", "theme_revisions", "themes",
  "page_revisions", "page_drafts", "pages",
  "site_modules", "sites", "memberships", "users", "organizations",
];

let nodeSeq = 0;
/** Build a node from registry defaults, then override specific props. */
function node(type: string, props: Record<string, unknown> = {}, children: PageNode[] = []): PageNode {
  const n = createNode(type, `n${++nodeSeq}`);
  Object.assign(n.props, props);
  n.children = children;
  return n;
}
const body = (root: PageNode[]): PageBody => ({ version: 1, root });

async function main() {
  console.log("→ truncating");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );

  console.log("→ org, user, membership");
  const org = await prisma.organization.create({ data: { name: "Acme Inc", plan: "pro" } });
  const user = await prisma.user.create({
    data: {
      email: "demo@acme.test",
      // FAKED: not a real hash and never verified. There is no login.
      passwordHash: "seeded-no-login-ui",
    },
  });
  await prisma.membership.create({ data: { orgId: org.id, userId: user.id, role: "owner" } });

  console.log("→ site + commerce module");
  const site = await prisma.site.create({
    data: {
      orgId: org.id,
      name: "Acme Store",
      slug: "acme-store",
      // Routing against this is real (Host header, with a ?host= override for
      // local testing). DNS and SSL are out of scope.
      customDomain: "acme.test",
    },
  });
  await prisma.siteModule.create({ data: { siteId: site.id, module: "commerce" } });

  console.log("→ theme v1");
  const theme = await prisma.theme.create({ data: { siteId: site.id, name: "Acme Default" } });
  const themeRev = await prisma.themeRevision.create({
    data: {
      themeId: theme.id,
      versionNo: 1,
      tokens: {
        ...DEFAULT_TOKENS,
        colorAccent: "#1b1b6f",
        colorSurface: "#f4f4f6",
      },
      layout: {
        ...DEFAULT_LAYOUT,
        nav: {
          brand: "ACME",
          links: [
            { label: "Shop", href: "/" },
            { label: "About", href: "/about" },
          ],
        },
        footer: {
          text: "© Acme Store — this page was compiled from a JSON description.",
          links: [{ label: "About", href: "/about" }],
        },
      },
    },
  });
  await prisma.theme.update({
    where: { id: theme.id },
    data: { currentRevisionId: themeRev.id },
  });

  console.log("→ media");
  const heroMedia = await prisma.media.create({
    data: {
      siteId: site.id,
      storageKey: svgDataUri("#1b1b6f", "#0b0b0f", ""),
      mime: "image/svg+xml",
      width: 1200,
      height: 900,
      sizeBytes: 1024,
    },
  });
  const aboutMedia = await prisma.media.create({
    data: {
      siteId: site.id,
      storageKey: svgDataUri("#2f6f5f", "#0b0b0f", ""),
      mime: "image/svg+xml",
      width: 1200,
      height: 900,
      sizeBytes: 1024,
    },
  });

  console.log("→ products, variants, collection");
  const productSpecs = [
    { title: "Field Notebook", desc: "Ruled, 120gsm, lies flat.", price: 1800, sku: "FN-01", from: "#3b3b8f", to: "#101014" },
    { title: "Desk Lamp", desc: "Warm dimmable LED, matte aluminium.", price: 8900, sku: "DL-02", from: "#8f6b3b", to: "#101014" },
    { title: "Ceramic Mug", desc: "350ml, reactive glaze, dishwasher safe.", price: 2400, sku: "CM-03", from: "#3b8f6b", to: "#101014" },
  ];

  const products = [];
  for (const spec of productSpecs) {
    const product = await prisma.product.create({
      data: {
        siteId: site.id,
        title: spec.title,
        description: spec.desc,
        imageUrl: svgDataUri(spec.from, spec.to, spec.title.split(" ")[0].toLowerCase()),
        status: "active",
        variants: {
          create: { sku: spec.sku, priceCents: spec.price, inventoryQty: 50, options: { size: "one" } },
        },
      },
    });
    products.push(product);
  }

  const collection = await prisma.collection.create({
    data: {
      siteId: site.id,
      title: "Featured",
      handle: "featured",
      products: {
        create: products.map((p, i) => ({ productId: p.id, position: i })),
      },
    },
  });

  await prisma.customer.create({
    data: { siteId: site.id, email: "buyer@example.test", name: "Sam Buyer" },
  });

  console.log("→ pages + drafts");
  const home = await prisma.page.create({
    data: { siteId: site.id, path: "/", type: "page", title: "Home" },
  });
  const about = await prisma.page.create({
    data: { siteId: site.id, path: "/about", type: "page", title: "About" },
  });

  // Note what is stored: names and values. No markup anywhere. (Non-negotiable #1)
  await prisma.pageDraft.create({
    data: {
      pageId: home.id,
      updatedBy: user.id,
      body: toJson(body([
        node("Hero", {
          headline: "Everything here is a description.",
          subhead:
            "Not one byte of HTML is stored in the database. This page is a JSON tree of component names and props, compiled to a static file at publish time.",
          background: heroMedia.id,
          ctaLabel: "See the collection",
          ctaHref: "#featured",
          padding: "xl",
        }),
        node("ProductGrid", {
          heading: "Featured",
          collection: collection.id,
          columns: "3",
          ctaLabel: "Add to cart",
        }),
        node("TextBlock", {
          heading: "Static, but not inert",
          body:
            "The page you are reading was rendered once, minutes or weeks ago, and written to disk. No server touched it to answer your request.\n\nThe cart still works. Its JavaScript calls the runtime API, and placing an order writes a row to the orders table — while this file's checksum stays exactly the same.",
          align: "left",
        }),
        node("Button", { label: "Read the architecture", href: "/about", variant: "outline" }),
        node("Spacer", { height: 40 }),
      ])),
    },
  });

  await prisma.pageDraft.create({
    data: {
      pageId: about.id,
      updatedBy: user.id,
      body: toJson(body([
        node("Hero", {
          headline: "Rollback is one column.",
          subhead: "UPDATE sites SET live_release_id = <older release>. Nothing rebuilds.",
          background: "",
          ctaLabel: "",
          ctaHref: "",
          align: "left",
          padding: "lg",
        }),
        node("TextBlock", {
          heading: "Why append instead of overwrite",
          body:
            "Descriptions are small. Storing every published arrangement forever costs almost nothing, and it buys the one thing an overwrite can never give back: the ability to return to a state that already worked.",
        }),
        node("ImageBlock", { media: aboutMedia.id, caption: "Every release is still on disk.", width: "wide" }),
        node("Spacer", { height: 64 }),
      ])),
    },
  });

  console.log(`
✓ seeded
  org        ${org.name}
  user       ${user.email}   (no password — auth is faked)
  site       ${site.name}  /s/${site.slug}   domain: ${site.customDomain}
  pages      /  and  /about   (drafts only — nothing is published yet)
  commerce   ${products.length} products in collection "${collection.handle}"

  Nothing is live until you publish. That is the point: a site with content
  in the database and no release has no artifact, so it has nothing to serve.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
