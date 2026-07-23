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
import { createComponentRef, createNode } from "../src/lib/registry";
import type { PageBody, PageNode } from "../src/lib/registry/types";
import { DEFAULT_LAYOUT, DEFAULT_TOKENS } from "../src/lib/theme";
import { toJson } from "../src/lib/json";
import { hashPassword } from "../src/lib/auth";

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
  "activity_log", "page_locks", "sessions",
  "media", "theme_revisions", "themes",
  "component_revisions", "component_drafts", "components",
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

  console.log("→ orgs, users, memberships");
  const org = await prisma.organization.create({ data: { name: "Acme Inc", plan: "pro" } });

  // Real scrypt hashes. There is a login screen, and it verifies these.
  const password = await hashPassword("demo1234");

  const user = await prisma.user.create({
    data: { email: "amar@acme.test", name: "Amar Waqar", passwordHash: password },
  });
  const colleague = await prisma.user.create({
    data: { email: "sara@acme.test", name: "Sara Ahmed", passwordHash: password },
  });

  // Both in the same org, so both see every Acme site — that is the access model:
  // membership of an organisation, not a per-site grant.
  await prisma.membership.create({ data: { orgId: org.id, userId: user.id, role: "owner" } });
  await prisma.membership.create({
    data: { orgId: org.id, userId: colleague.id, role: "editor" },
  });

  // A SECOND organisation with its own user and its own site. Nothing about it
  // is decorative: it is what makes "org-scoped access" testable rather than
  // asserted. Sign in as this user and Acme's sites are not merely hidden from
  // the list — every site-scoped endpoint answers 403.
  const otherOrg = await prisma.organization.create({ data: { name: "Globex Ltd" } });
  const outsider = await prisma.user.create({
    data: { email: "kim@globex.test", name: "Kim Novak", passwordHash: password },
  });
  await prisma.membership.create({
    data: { orgId: otherOrg.id, userId: outsider.id, role: "owner" },
  });

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

  // ── A shared component, used by both pages ────────────────────────────────
  // Defined once here. Both page drafts below hold a REFERENCE to it and none of
  // its content. Edit it in the editor, publish, and both pages change; roll
  // back, and both pages get this version again — because the release pinned the
  // revision, not the component.
  console.log("→ shared components");
  const banner = await prisma.component.create({
    data: {
      siteId: site.id,
      name: "Announcement bar",
      draft: {
        create: {
          updatedBy: user.id,
          lockVersion: 1,
          body: toJson(
            body([
              node("TextBlock", {
                heading: "One definition, two pages",
                body: "This bar is a shared component. Neither page stores its text — they store a reference to it. Open it from the palette, change a word, publish, and both pages change together.",
                bgColor: "#0f172a",
                fgColor: "#e2e8f0",
                paddingTop: 18,
                paddingBottom: 18,
                contentWidth: "wide",
                align: "center",
              }),
            ]),
          ),
        },
      },
    },
  });

  console.log("→ pages + drafts");
  const home = await prisma.page.create({
    data: { siteId: site.id, path: "/", type: "page", title: "Home" },
  });
  const about = await prisma.page.create({
    data: { siteId: site.id, path: "/about", type: "page", title: "About" },
  });

  const bannerOn = (instanceId: string) => createComponentRef(banner.id, instanceId);

  /**
   * Store a page the way the system actually stores pages.
   *
   * Every top-level block becomes a component record, and the page keeps only an
   * ordered list of references to them. A block that is already a reference —
   * the announcement bar — is carried over untouched, because it is a component
   * that happens to be used twice.
   *
   * Seeding the old shape and relying on the migration to fix it would mean the
   * demo database and a fresh install disagreed about the storage model, which
   * is exactly the kind of drift the rest of this codebase works to avoid.
   */
  async function storePage(siteId: string, userId: string, pageId: string, blocks: PageNode[]) {
    const refs: PageNode[] = [];

    for (const block of blocks) {
      if (block.type === "@component") {
        refs.push(block);
        continue;
      }
      const component = await prisma.component.create({
        data: {
          siteId,
          kind: block.type,
          draft: {
            create: {
              updatedBy: userId,
              lockVersion: 1,
              body: toJson(body([block])),
            },
          },
        },
      });
      refs.push(createComponentRef(component.id, `ref-${++nodeSeq}`));
    }

    await prisma.pageDraft.create({
      data: { pageId, updatedBy: userId, body: toJson(body(refs)) },
    });
  }

  // Note what is stored: names and values. No markup anywhere. (Non-negotiable #1)
  await storePage(site.id, user.id, home.id, [
        bannerOn("n-banner-home"),
        node("Hero", {
          headline: "Everything here is a description.",
          subhead:
            "Not one byte of HTML is stored in the database. This page is a JSON tree of component names and props, compiled to a static file at publish time.",
          bgImage: heroMedia.id,
          bgOverlay: 60,
          ctaLabel: "See the collection",
          ctaHref: "#featured",
          align: "center",
          paddingTop: 150,
          paddingBottom: 150,
          size: 68,
        }),
        node("ProductGrid", {
          heading: "Featured",
          collection: collection.id,
          columns: "3",
          ctaLabel: "Add to cart",
          paddingTop: 72,
          paddingBottom: 24,
        }),
        node("TextBlock", {
          heading: "Static, but not inert",
          body:
            "The page you are reading was rendered once, minutes or weeks ago, and written to disk. No server touched it to answer your request.\n\nThe cart still works. Its JavaScript calls the runtime API, and placing an order writes a row to the orders table — while this file's checksum stays exactly the same.",
          paddingTop: 48,
          paddingBottom: 16,
        }),
        // A container with two cards inside it — children nest in the same tree.
        node(
          "Columns",
          { columns: "2", gap: 24, paddingTop: 16, paddingBottom: 56 },
          [
            node("Card", {
              title: "Version everything that should be versioned",
              body: "Pages, layouts and themes are appended, never overwritten. Rolling back is a pointer swap.",
              linkLabel: "How",
              linkHref: "/about",
              paddingTop: 0,
              paddingBottom: 0,
              contentWidth: "full",
            }),
            node("Card", {
              title: "Leave the business data alone",
              body: "Products, orders and customers are live. Reverting a design must not un-place an order.",
              linkLabel: "Why",
              linkHref: "/about",
              paddingTop: 0,
              paddingBottom: 0,
              contentWidth: "full",
            }),
          ],
        ),
        node("Divider", { width: 100, paddingTop: 0, paddingBottom: 0 }),
        node("Button", {
          label: "Read the architecture",
          href: "/about",
          variant: "outline",
          align: "center",
          paddingTop: 40,
          paddingBottom: 56,
        }),
  ]);

  await storePage(site.id, user.id, about.id, [
        bannerOn("n-banner-about"),
        node("Hero", {
          headline: "Rollback is one column.",
          subhead: "UPDATE sites SET live_release_id = <older release>. Nothing rebuilds.",
          bgImage: "",
          bgColor: "#0b0b0f",
          fgColor: "#ffffff",
          ctaLabel: "",
          ctaHref: "",
          align: "left",
          paddingTop: 112,
          paddingBottom: 112,
          size: 54,
        }),
        node("Heading", {
          text: "Why append instead of overwrite",
          level: "h2",
          size: 34,
          paddingTop: 64,
          paddingBottom: 8,
        }),
        node("TextBlock", {
          body:
            "Descriptions are small. Storing every published arrangement forever costs almost nothing, and it buys the one thing an overwrite can never give back: the ability to return to a state that already worked.",
          paddingTop: 0,
          paddingBottom: 40,
        }),
        node("ImageBlock", {
          media: aboutMedia.id,
          caption: "Every release is still on disk.",
          contentWidth: "wide",
          ratio: "16/9",
          paddingTop: 0,
          paddingBottom: 72,
        }),
  ]);

  console.log(`
✓ seeded
  sign in    http://localhost:3000/login      password for all: demo1234

  ${org.name}
    ${user.email}      ${user.name} (owner)
    ${colleague.email}      ${colleague.name} (editor)
    site ${site.name} — /s/${site.slug}, domain ${site.customDomain}
    pages / and /about, ${products.length} products in "${collection.handle}"

  ${otherOrg.name}
    ${outsider.email}     ${outsider.name} (owner)
    site Globex Ltd — /s/globex

  Sign in as two Acme users in two browsers and open the same page to see the
  editing lock: the second one gets a read-only view that updates itself.

  Sign in as ${outsider.email} to see the access boundary — Acme's sites are
  not listed, and requesting one directly answers 403.

  Nothing is live until you publish. A site with content in the database and no
  release has nothing to serve, which is the point.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
