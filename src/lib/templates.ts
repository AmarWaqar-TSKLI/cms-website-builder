/**
 * SITE TEMPLATES — start a new site from a finished, designed one.
 *
 * The blank starter is honest but plain; a template is the opposite promise:
 * pick "Portfolio" or "Café" and land on a multi-page site that already looks
 * like something, with its own palette, fonts and real (if placeholder) copy —
 * then change the words to yours.
 *
 * These are the same shape the AI builder produces: an array of pages, each an
 * array of ordinary top-level blocks, handed to createSiteFromPages(). So a site
 * made from a template is byte-for-byte an ordinary site — every block editable,
 * movable, deletable, with nothing template-specific left behind to detach from.
 *
 * Deliberately IMAGE-FREE. Every block here renders complete from theme tokens
 * alone — no "pick an image" placeholders staring back on a brand-new site. A
 * hero, a row of cards, testimonials, stats, pricing, an FAQ and a call to
 * action all look finished with nothing but colour and type, which is the whole
 * point of "start from something beautiful". The owner adds their own photos when
 * they have them.
 */
import { createNode } from "./registry";
import type { PageNode, ThemeTokens } from "./registry/types";

// Web-safe font stacks — identical rendering in the editor, live and in an
// export, for the same no-network reason the theme picker uses them.
const FONT = {
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  georgia: "Georgia, Cambria, 'Times New Roman', serif",
  palatino: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
};

let seq = 0;
function node(
  type: string,
  props: Record<string, unknown> = {},
  children: PageNode[] = [],
): PageNode {
  const n = createNode(type, `t${++seq}`);
  Object.assign(n.props, props);
  n.children = children;
  return n;
}

/** A block inside a Columns cell: no section padding, fills the column. */
function cell(type: string, props: Record<string, unknown> = {}) {
  return node(type, { paddingTop: 0, paddingBottom: 0, contentWidth: "full", ...props });
}

// ── Section builders, shared across templates ────────────────────────────────

function hero(headline: string, subhead: string, ctaLabel: string, opts: { align?: string } = {}) {
  return node("Hero", {
    headline,
    subhead,
    size: 66,
    ctaLabel,
    ctaHref: "#",
    ctaVariant: "solid",
    align: opts.align ?? "center",
    paddingTop: 120,
    paddingBottom: 104,
  });
}

function heading(text: string, top = 80) {
  return node("Heading", {
    text,
    level: "h2",
    size: 36,
    weight: "700",
    align: "center",
    paddingTop: top,
    paddingBottom: 10,
  });
}

function intro(body: string) {
  return node("TextBlock", {
    heading: "",
    body,
    size: 17,
    lineHeight: 165,
    measure: 58,
    align: "center",
    contentWidth: "narrow",
    paddingTop: 0,
    paddingBottom: 8,
  });
}

function cardsRow(cards: { title: string; body: string }[], bottom = 80) {
  return node(
    "Columns",
    { columns: String(cards.length) as "2" | "3", gap: 24, verticalAlign: "stretch", paddingTop: 22, paddingBottom: bottom },
    cards.map((c) => cell("Card", { title: c.title, body: c.body, linkLabel: "", bordered: true })),
  );
}

function statsRow(stats: { value: string; label: string }[], tone?: string) {
  return node(
    "Columns",
    { columns: String(stats.length) as "3" | "4", gap: 20, verticalAlign: "center", bgColor: tone ?? "", paddingTop: 72, paddingBottom: 72 },
    stats.map((s) => cell("Stat", { value: s.value, label: s.label, valueSize: 46, align: "center" })),
  );
}

function testimonialsRow(items: { quote: string; author: string; role: string }[]) {
  return node(
    "Columns",
    { columns: String(items.length) as "2" | "3", gap: 24, verticalAlign: "stretch", paddingTop: 22, paddingBottom: 80 },
    items.map((t) => cell("Testimonial", { quote: t.quote, author: t.author, role: t.role, rating: 5 })),
  );
}

function pricingRow(tiers: { name: string; price: string; period: string; features: string; highlighted?: boolean; badge?: string }[]) {
  return node(
    "Columns",
    { columns: "3", gap: 20, verticalAlign: "stretch", paddingTop: 22, paddingBottom: 80 },
    tiers.map((t) =>
      cell("PricingTier", {
        name: t.name,
        price: t.price,
        period: t.period,
        features: t.features,
        ctaLabel: "Choose plan",
        ctaHref: "#",
        highlighted: !!t.highlighted,
        badge: t.badge ?? "",
      }),
    ),
  );
}

function faq(items: { q: string; a: string }[]) {
  return items.map((it, i) =>
    node("FaqItem", {
      question: it.q,
      answer: it.a,
      defaultOpen: i === 0,
      contentWidth: "narrow",
      paddingTop: i === 0 ? 18 : 0,
      paddingBottom: i === items.length - 1 ? 80 : 0,
    }),
  );
}

function cta(headline: string, subhead: string, ctaLabel: string) {
  return node("CtaBand", {
    headline,
    subhead,
    ctaLabel,
    ctaHref: "#",
    ctaVariant: "solid",
    align: "center",
    paddingTop: 84,
    paddingBottom: 100,
  });
}

function prose(headingText: string, body: string) {
  return node("TextBlock", {
    heading: headingText,
    body,
    size: 17,
    lineHeight: 170,
    measure: 68,
    align: "left",
    paddingTop: 80,
    paddingBottom: 40,
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface TemplatePage {
  path: string;
  title: string;
  blocks: PageNode[];
}

export interface SiteTemplate {
  id: string;
  name: string;
  /** One line under the name in the gallery. */
  tagline: string;
  category: string;
  /** The template's own look — applied as the site's theme on creation. */
  tokens: Partial<ThemeTokens>;
  pages: TemplatePage[];
}

// ── The templates ────────────────────────────────────────────────────────────

const portfolio: SiteTemplate = {
  id: "portfolio",
  name: "Portfolio",
  tagline: "For a designer, writer or maker showing their work.",
  category: "Personal",
  tokens: {
    colorBg: "#ffffff", colorFg: "#14141a", colorSurface: "#f5f5f7", colorBorder: "#e5e5ea",
    colorAccent: "#1b1b6f", colorAccentFg: "#ffffff", colorMuted: "#6b6b76",
    fontHeading: FONT.georgia, fontBody: FONT.sans, radius: "10px",
  },
  pages: [
    {
      path: "/",
      title: "Home",
      blocks: [
        hero("Jordan Ellis", "Designer and illustrator making calm, useful things for good people. Currently open to new work.", "See my work", { align: "left" }),
        heading("Selected work"),
        intro("A few projects I'm proud of. Swap these for your own — a title and a sentence is all each one needs."),
        cardsRow([
          { title: "Brand for Fernwood", body: "A warm identity for a neighbourhood bakery — logo, packaging and a little bit of soul." },
          { title: "Atlas app", body: "Product design for a travel app, from first sketches to a shipped iOS release." },
          { title: "Field Notes zine", body: "A self-published print zine — writing, layout and risograph printing, start to finish." },
        ]),
        testimonialsRow([
          { quote: "Jordan just gets it. The first round was already better than anything we'd tried ourselves.", author: "Dana Whitfield", role: "Founder, Fernwood" },
          { quote: "Calm, fast, and genuinely lovely to work with. Would hire again in a heartbeat.", author: "Marcus Lee", role: "PM, Atlas" },
        ]),
        cta("Have something in mind?", "I take on a couple of projects a month. Tell me what you're working on.", "Get in touch"),
      ],
    },
    {
      path: "/about",
      title: "About",
      blocks: [
        heading("About me", 96),
        prose("Hello, I'm Jordan", "I've spent the last ten years helping small teams look like themselves. I care about clarity, warmth, and getting out of the way of the work.\n\nBefore going independent I led design at a studio you've probably never heard of, which is exactly how they liked it. Now I work with founders, writers and the occasional bakery.\n\nWhen I'm not at the desk you'll find me walking, printing, or quietly reorganising my bookshelf by colour."),
        statsRow([
          { value: "10 yrs", label: "Doing this" },
          { value: "60+", label: "Projects shipped" },
          { value: "3", label: "Cities lived in" },
        ], "#f5f5f7"),
        cta("Let's make something", "I'd love to hear about your project.", "Say hello"),
      ],
    },
  ],
};

const cafe: SiteTemplate = {
  id: "cafe",
  name: "Café",
  tagline: "For a coffee shop, bakery or small restaurant.",
  category: "Local business",
  tokens: {
    colorBg: "#fffdfb", colorFg: "#201812", colorSurface: "#fff2ea", colorBorder: "#f0dccb",
    colorAccent: "#b5561f", colorAccentFg: "#ffffff", colorMuted: "#7c6a5f",
    fontHeading: FONT.palatino, fontBody: FONT.georgia, radius: "14px",
  },
  pages: [
    {
      path: "/",
      title: "Home",
      blocks: [
        hero("Rowan & Rye", "A neighbourhood café for slow mornings and good coffee. Fresh bakes daily, kind faces always.", "See the menu"),
        cardsRow([
          { title: "Coffee, done right", body: "Single-origin beans, roasted locally, pulled by people who actually care how it tastes." },
          { title: "Baked this morning", body: "Sourdough, croissants and something sweet — all made in-house before the sun's properly up." },
          { title: "A place to stay", body: "Big tables, free wifi and no one rushing you out. Stay for one cup or three." },
        ]),
        heading("What people say"),
        testimonialsRow([
          { quote: "The best flat white in the neighbourhood, and it isn't close. My daily stop.", author: "Priya S.", role: "Regular since day one" },
          { quote: "Cosy, friendly and the almond croissant is dangerous. I'm here far too often.", author: "Tom B.", role: "Local" },
          { quote: "They remember my order and my dog's name. That's the whole thing, isn't it?", author: "Lena M.", role: "Regular" },
        ]),
        cta("Come say hello", "Open 7am–4pm, seven days a week. 24 Maple Street. No bookings — just turn up.", "Find us"),
      ],
    },
    {
      path: "/menu",
      title: "Menu",
      blocks: [
        heading("The menu", 96),
        intro("A short, honest menu that changes with the seasons. Prices are a guide — swap in your own."),
        cardsRow([
          { title: "Coffee", body: "Espresso · 3.00\nFlat white · 3.80\nFilter · 3.50\nMocha · 4.20" },
          { title: "Bakery", body: "Butter croissant · 3.20\nAlmond croissant · 3.90\nCinnamon bun · 4.00\nDaily loaf · 5.50" },
          { title: "Kitchen", body: "Sourdough toast · 5.00\nBig breakfast · 11.50\nSoup of the day · 7.50\nGrilled cheese · 8.00" },
        ]),
        cta("Hungry yet?", "Everything's made fresh each morning. Get here early for the good stuff.", "See opening hours"),
      ],
    },
  ],
};

const startup: SiteTemplate = {
  id: "startup",
  name: "Startup",
  tagline: "A clean SaaS landing page with pricing and FAQ.",
  category: "Business",
  tokens: {
    colorBg: "#ffffff", colorFg: "#0f172a", colorSurface: "#f1f5f9", colorBorder: "#e2e8f0",
    colorAccent: "#2563eb", colorAccentFg: "#ffffff", colorMuted: "#64748b",
    fontHeading: FONT.sans, fontBody: FONT.sans, radius: "10px",
  },
  pages: [
    {
      path: "/",
      title: "Home",
      blocks: [
        hero("Ship it on Monday", "The all-in-one workspace that gets out of your team's way. Plan, build and launch without the busywork.", "Start free"),
        heading("Why teams switch"),
        cardsRow([
          { title: "Fast by default", body: "No loading spinners, no waiting. Everything happens the instant you click it." },
          { title: "Works how you do", body: "Bring your own workflow. We bend to fit your team, not the other way round." },
          { title: "Nothing to manage", body: "Hosted, backed up and updated for you. You do the work; we keep the lights on." },
        ]),
        statsRow([
          { value: "10k+", label: "Teams onboard" },
          { value: "99.9%", label: "Uptime" },
          { value: "4.9/5", label: "Average rating" },
          { value: "2 min", label: "To set up" },
        ], "#f1f5f9"),
        heading("Simple pricing"),
        pricingRow([
          { name: "Free", price: "$0", period: "/month", features: "Up to 3 people\nCore features\nCommunity support" },
          { name: "Pro", price: "$12", period: "/user/mo", features: "Unlimited people\nEverything in Free\nIntegrations\nPriority support", highlighted: true, badge: "Most popular" },
          { name: "Scale", price: "Let's talk", period: "", features: "Everything in Pro\nSSO & advanced security\nA dedicated contact" },
        ]),
        heading("Questions, answered"),
        ...faq([
          { q: "Is there really a free plan?", a: "Yes — free for up to three people, forever. No card needed to start." },
          { q: "Can I change plans later?", a: "Any time, in one click. Upgrades apply instantly and downgrades at your next cycle." },
          { q: "How do I get my data out?", a: "Export everything to a standard file whenever you like. Your data is always yours." },
        ]),
        cta("Ready when you are", "Start free in two minutes. No card, no sales call, no catch.", "Get started"),
      ],
    },
  ],
};

const agency: SiteTemplate = {
  id: "agency",
  name: "Agency",
  tagline: "A bold, dark studio site with services and team.",
  category: "Business",
  tokens: {
    colorBg: "#0b1220", colorFg: "#eef2f8", colorSurface: "#121a2b", colorBorder: "#24304a",
    colorAccent: "#d4af37", colorAccentFg: "#10151f", colorMuted: "#8b97ad",
    fontHeading: FONT.georgia, fontBody: FONT.sans, radius: "6px",
  },
  pages: [
    {
      path: "/",
      title: "Home",
      blocks: [
        hero("We make brands people remember", "A small studio for strategy, identity and the web. We work with a handful of clients at a time, and we make them count.", "Start a project", { align: "left" }),
        heading("What we do"),
        cardsRow([
          { title: "Strategy", body: "Positioning, naming and the story that ties it all together — before a single pixel." },
          { title: "Identity", body: "Logos, type and a system that still looks sharp two years and a hundred posts later." },
          { title: "Web", body: "Sites that load fast, read clearly and turn a browser into a believer." },
        ]),
        testimonialsRow([
          { quote: "They took our vague ambition and gave it a shape. Sales followed the rebrand within a quarter.", author: "Elena Ruiz", role: "CEO, Northwind" },
          { quote: "The most on-time, on-brief studio we've worked with. Rare, and worth every penny.", author: "David Okoye", role: "Founder, Loop" },
        ]),
        heading("The team"),
        cardsRow([
          { title: "Sasha Kerr", body: "Creative director. Twenty years turning briefs into brands worth arguing about." },
          { title: "Milan Vega", body: "Design lead. Obsessive about type, grids and the space between things." },
          { title: "Ada Nwosu", body: "Strategy. Finds the one true sentence a brand should be saying." },
        ]),
        cta("Got something big in mind?", "We take on a few projects a season. Tell us where you want to go.", "Start a project"),
      ],
    },
    {
      path: "/work",
      title: "Work",
      blocks: [
        heading("Selected work", 96),
        intro("A taste of recent projects. Replace these with your own case studies."),
        cardsRow([
          { title: "Northwind — rebrand", body: "A tired logistics firm made bold and modern. New name energy, same trucks." },
          { title: "Loop — identity", body: "A fintech startup's first real brand, from wordmark to pitch deck." },
        ]),
        cardsRow([
          { title: "Harbor — website", body: "A property group's flagship site: fast, calm, and quietly premium." },
          { title: " Member — campaign", body: "A launch campaign that put a new app in front of a million people in a week." },
        ]),
        cta("Your project next?", "Let's talk about what you're building.", "Get in touch"),
      ],
    },
  ],
};

export const TEMPLATES: SiteTemplate[] = [portfolio, cafe, startup, agency];

export function getTemplate(id: string): SiteTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
