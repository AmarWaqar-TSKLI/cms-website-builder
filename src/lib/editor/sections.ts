/**
 * SECTION TEMPLATES — whole designed sections you drop in with one click.
 *
 * The palette adds one block at a time. That is the right primitive, but it is
 * not how anyone thinks: nobody sets out to place "a heading, then a three-column
 * row, then three pricing cards". They think "put a pricing section here". A
 * section template is that thought made a button — a small, pre-composed tree of
 * ordinary blocks with the copy and spacing already right.
 *
 * Two things make this safe rather than a parallel content system:
 *
 *  1. A section is just an array of the SAME top-level blocks a person builds by
 *     hand. Each entry becomes its own component on insert (the decompose model),
 *     exactly like clicking it in from the palette would. Nothing here is a new
 *     kind of node, so everything downstream — autosave, publish, versioning,
 *     export — treats a dropped-in section identically to a hand-built one. It is
 *     fully editable the instant it lands; there is no "template" to detach from.
 *
 *  2. The blocks are authored ONCE here with placeholder ids. The store clones
 *     each with fresh ids at insert time (`cloneWithNewIds`), so dropping the same
 *     section twice can never collide, and the templates stay immutable.
 *
 * Spacing is deliberate. Every block carries its own top/bottom padding, so a
 * naive stack of two full-padded blocks leaves a canyon between a heading and its
 * grid. Each template tunes those paddings by hand: a generous gap ABOVE the
 * section and BELOW it, tight gaps within. The `child` blocks inside a Columns
 * row get zero section padding and full width, so they fill their cell and their
 * own card padding does the spacing — the same trick the starter homepage uses.
 */
import { createNode } from "../registry";
import type { PageNode } from "../registry/types";

// Vertical rhythm. The first block of a section owns the space above it and the
// last owns the space below, so sections stacked on a page breathe evenly.
const SECTION_TOP = 76;
const SECTION_BOTTOM = 76;

let seq = 0;

/** Build a fully-defaulted node (every schema default filled) then override. */
function node(
  type: string,
  props: Record<string, unknown> = {},
  children: PageNode[] = [],
): PageNode {
  const n = createNode(type, `s${++seq}`);
  Object.assign(n.props, props);
  n.children = children;
  return n;
}

/** A block placed INSIDE a Columns cell: no section padding, fills the column. */
function cell(type: string, props: Record<string, unknown> = {}, children: PageNode[] = []) {
  return node(type, { paddingTop: 0, paddingBottom: 0, contentWidth: "full", ...props }, children);
}

/** A centred section heading with tight space below (its grid follows closely). */
function sectionHeading(text: string, opts: { top?: number } = {}) {
  return node("Heading", {
    text,
    level: "h2",
    size: 36,
    weight: "700",
    align: "center",
    paddingTop: opts.top ?? SECTION_TOP,
    paddingBottom: 10,
  });
}

/** An optional supporting line under a section heading. */
function sectionIntro(body: string) {
  return node("TextBlock", {
    heading: "",
    body,
    size: 17,
    lineHeight: 165,
    measure: 60,
    align: "center",
    contentWidth: "narrow",
    paddingTop: 0,
    paddingBottom: 8,
  });
}

export interface SectionTemplate {
  id: string;
  label: string;
  /** One line, shown under the label in the picker. */
  description: string;
  /** The top-level blocks this section drops in, in order. */
  blocks: PageNode[];
}

/**
 * The starter set. Six sections that cover the parts people ask for by name —
 * pricing, testimonials, FAQ, team, features, stats — each a genuine multi-block
 * composition rather than a single fancy block (those are already one click from
 * the palette).
 */
export const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    id: "features-3up",
    label: "Feature trio",
    description: "Three benefits side by side with a heading.",
    blocks: [
      sectionHeading("Everything you need"),
      sectionIntro("A short line about what makes this worth someone's time."),
      node(
        "Columns",
        { columns: "3", gap: 24, verticalAlign: "stretch", paddingTop: 22, paddingBottom: SECTION_BOTTOM },
        [
          cell("Card", {
            title: "Fast to set up",
            body: "Get going in minutes. No code, no waiting — change anything by clicking it.",
            linkLabel: "",
            bordered: true,
          }),
          cell("Card", {
            title: "Yours to shape",
            body: "Colours, words and layout are all yours. Make it feel like you, not a template.",
            linkLabel: "",
            bordered: true,
          }),
          cell("Card", {
            title: "Ready to grow",
            body: "Add pages, a shop or a blog whenever you're ready. It grows with you.",
            linkLabel: "",
            bordered: true,
          }),
        ],
      ),
    ],
  },
  {
    id: "pricing-3",
    label: "Pricing table",
    description: "Three plans, the middle one highlighted.",
    blocks: [
      sectionHeading("Simple, honest pricing"),
      sectionIntro("Pick a plan that fits. Change or cancel whenever you like."),
      node(
        "Columns",
        { columns: "3", gap: 20, verticalAlign: "stretch", paddingTop: 22, paddingBottom: SECTION_BOTTOM },
        [
          cell("PricingTier", {
            name: "Starter",
            price: "$0",
            period: "/month",
            features: "One page\nHosted for you\nCommunity support",
            ctaLabel: "Get started",
            ctaHref: "#",
            highlighted: false,
            badge: "",
          }),
          cell("PricingTier", {
            name: "Pro",
            price: "$19",
            period: "/month",
            features: "Unlimited pages\nCustom domain\nRemove branding\nEmail support",
            ctaLabel: "Choose Pro",
            ctaHref: "#",
            highlighted: true,
            badge: "Most popular",
          }),
          cell("PricingTier", {
            name: "Team",
            price: "$49",
            period: "/month",
            features: "Everything in Pro\nInvite teammates\nPriority support",
            ctaLabel: "Choose Team",
            ctaHref: "#",
            highlighted: false,
            badge: "",
          }),
        ],
      ),
    ],
  },
  {
    id: "testimonials-3",
    label: "Testimonials",
    description: "A row of three customer quotes.",
    blocks: [
      sectionHeading("Loved by people like you"),
      node(
        "Columns",
        { columns: "3", gap: 24, verticalAlign: "stretch", paddingTop: 22, paddingBottom: SECTION_BOTTOM },
        [
          cell("Testimonial", {
            quote: "Honestly the first builder I didn't give up on. I had a real site up the same afternoon.",
            author: "Maya Chen",
            role: "Founder, Riverbend Studio",
            rating: 5,
          }),
          cell("Testimonial", {
            quote: "I'm not techy at all and I still made something I'm proud of. Editing is just clicking.",
            author: "Tom Alvarez",
            role: "Owner, Alvarez Coffee",
            rating: 5,
          }),
          cell("Testimonial", {
            quote: "Changed the whole look in one click when our branding shifted. Didn't touch a single page.",
            author: "Priya Nair",
            role: "Marketing, Northwind",
            rating: 5,
          }),
        ],
      ),
    ],
  },
  {
    id: "faq",
    label: "FAQ",
    description: "A heading and four expandable questions.",
    blocks: [
      sectionHeading("Frequently asked questions"),
      node("FaqItem", {
        question: "Do I need to know how to code?",
        answer: "Not at all. You build and edit everything by clicking — no code anywhere.",
        defaultOpen: true,
        contentWidth: "narrow",
        paddingTop: 18,
        paddingBottom: 0,
      }),
      node("FaqItem", {
        question: "Can I use my own domain?",
        answer: "Yes. You can connect a custom domain so visitors see your own web address.",
        defaultOpen: false,
        contentWidth: "narrow",
        paddingTop: 0,
        paddingBottom: 0,
      }),
      node("FaqItem", {
        question: "What happens when I publish?",
        answer: "Your changes go live at your web address. You can roll back to an earlier version any time.",
        defaultOpen: false,
        contentWidth: "narrow",
        paddingTop: 0,
        paddingBottom: 0,
      }),
      node("FaqItem", {
        question: "Can I change the design later?",
        answer: "Whenever you like. Open the Design tab and pick a new Look, or fine-tune the colours and fonts yourself.",
        defaultOpen: false,
        contentWidth: "narrow",
        paddingTop: 0,
        paddingBottom: SECTION_BOTTOM,
      }),
    ],
  },
  {
    id: "team-grid",
    label: "Team grid",
    description: "Meet-the-team cards, three across.",
    blocks: [
      sectionHeading("Meet the team"),
      sectionIntro("The people behind the work."),
      node(
        "Columns",
        { columns: "3", gap: 24, verticalAlign: "stretch", paddingTop: 22, paddingBottom: SECTION_BOTTOM },
        [
          cell("Card", {
            title: "Jordan Lee",
            body: "Founder & designer. Believes good tools get out of your way.",
            linkLabel: "",
            bordered: true,
          }),
          cell("Card", {
            title: "Sam Okafor",
            body: "Engineering. Keeps the whole thing fast and boringly reliable.",
            linkLabel: "",
            bordered: true,
          }),
          cell("Card", {
            title: "Riley Costa",
            body: "Support & community. The person who actually answers your email.",
            linkLabel: "",
            bordered: true,
          }),
        ],
      ),
    ],
  },
  {
    id: "stats-band",
    label: "Stats band",
    description: "Four big numbers on a surface strip.",
    blocks: [
      node(
        "Columns",
        {
          columns: "4",
          gap: 20,
          verticalAlign: "center",
          bgColor: "", // inherits the theme surface via the cells below
          paddingTop: SECTION_TOP,
          paddingBottom: SECTION_BOTTOM,
        },
        [
          cell("Stat", { value: "10k+", label: "Sites built", valueSize: 46, align: "center" }),
          cell("Stat", { value: "99.9%", label: "Uptime", valueSize: 46, align: "center" }),
          cell("Stat", { value: "5 min", label: "To first page", valueSize: 46, align: "center" }),
          cell("Stat", { value: "24/7", label: "Support", valueSize: 46, align: "center" }),
        ],
      ),
    ],
  },
];
