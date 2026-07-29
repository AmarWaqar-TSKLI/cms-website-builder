/**
 * Creating a brand-new site for a brand-new person.
 *
 * The seeded "Acme Store" is a DEMO fixture — a finished sample site so the app
 * has something to show and the tests something to run against. A real new user
 * must never inherit it. This builds them a fresh site of their own with a
 * friendly, EDITABLE starter homepage: welcoming words, a couple of sections,
 * and a call to action — a real starting point, not a blank page and not
 * somebody else's shop.
 *
 * It stores the page exactly the way the product does: every top-level block is
 * its own component record, and the page keeps an ordered list of references to
 * them (the decompose model). So the starter page behaves identically to one a
 * person builds by hand — every block is editable, movable, deletable.
 */
import { prisma } from "./db";
import { createComponentRef, createNode } from "./registry";
import type { PageBody, PageNode } from "./registry/types";
import { DEFAULT_LAYOUT, DEFAULT_TOKENS } from "./theme";
import { toJson } from "./json";
import { slugify } from "./slug";

let seq = 0;
function node(type: string, props: Record<string, unknown> = {}, children: PageNode[] = []): PageNode {
  const n = createNode(type, `n${++seq}`);
  Object.assign(n.props, props);
  n.children = children;
  return n;
}
const body = (root: PageNode[]): PageBody => ({ version: 1, root });

async function uniqueSlug(base: string): Promise<string> {
  for (let i = 1; i < 500; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const clash = await prisma.site.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) return slug;
  }
  return `${base}-${Date.now()}`;
}

/** The starter homepage — blocks that all render nicely with no images set yet. */
function starterBlocks(siteName: string): PageNode[] {
  return [
    node("Hero", {
      headline: `Welcome to ${siteName}`,
      subhead:
        "This is your homepage — a starting point you can change however you like. Click any words to edit them, or drag a new block in from the left.",
      ctaLabel: "Get started",
      ctaHref: "#",
      ctaVariant: "solid",
      align: "center",
      size: 60,
      paddingTop: 120,
      paddingBottom: 120,
    }),
    node(
      "Columns",
      { columns: "2", gap: 24, paddingTop: 64, paddingBottom: 24 },
      [
        node("Card", {
          title: "Make it yours",
          body: "Every block on this page is a starting point. Change the words, the colours, add your own photos — nothing here is fixed.",
          linkLabel: "",
          bordered: true,
          paddingTop: 0,
          paddingBottom: 0,
          contentWidth: "full",
        }),
        node("Card", {
          title: "Add whatever you need",
          body: "Drag in headings, images, buttons, pricing, galleries and more from the panel on the left. Drop them wherever you want.",
          linkLabel: "",
          bordered: true,
          paddingTop: 0,
          paddingBottom: 0,
          contentWidth: "full",
        }),
      ],
    ),
    node("CtaBand", {
      headline: "Ready to go live?",
      subhead: "When it looks the way you want, press Publish — your site gets a real web address you can share.",
      ctaLabel: "Learn more",
      ctaHref: "#",
      align: "center",
      paddingTop: 72,
      paddingBottom: 96,
    }),
  ];
}

async function storePage(siteId: string, userId: string, pageId: string, blocks: PageNode[]) {
  const refs: PageNode[] = [];
  for (const block of blocks) {
    const component = await prisma.component.create({
      data: {
        siteId,
        kind: block.type,
        draft: {
          create: { updatedBy: userId, lockVersion: 1, body: toJson(body([block])) },
        },
      },
    });
    refs.push(createComponentRef(component.id, `ref-${++seq}`));
  }
  await prisma.pageDraft.create({
    data: { pageId, updatedBy: userId, body: toJson(body(refs)) },
  });
}

/** Build a fresh site (theme + a starter homepage) under an org. Returns it. */
export async function createStarterSite(orgId: string, siteName: string, userId: string) {
  const slug = await uniqueSlug(slugify(siteName) || "my-site");

  const site = await prisma.site.create({ data: { orgId, name: siteName, slug } });

  const theme = await prisma.theme.create({ data: { siteId: site.id, name: "Default" } });
  const rev = await prisma.themeRevision.create({
    data: {
      themeId: theme.id,
      versionNo: 1,
      tokens: toJson(DEFAULT_TOKENS),
      layout: toJson({
        ...DEFAULT_LAYOUT,
        nav: { brand: siteName, links: [{ label: "Home", href: "/" }] },
        footer: { text: `© ${siteName}`, links: [] },
      }),
    },
  });
  await prisma.theme.update({ where: { id: theme.id }, data: { currentRevisionId: rev.id } });

  const home = await prisma.page.create({
    data: { siteId: site.id, path: "/", type: "page", title: "Home" },
  });
  await storePage(site.id, userId, home.id, starterBlocks(siteName));

  return site;
}
