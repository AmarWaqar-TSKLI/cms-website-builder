/**
 * The AI site builder.
 *
 * Turns a plain-language description ("a bakery in Lisbon") into a homepage —
 * real headline, real sections, real call to action — by asking a language model
 * to compose blocks from THIS app's registry. The model never emits HTML or
 * free-form markup; it emits the same {type, props} descriptions the editor
 * produces, and every one is validated against the registry before it can reach
 * a page. An unknown block, or a prop the model invented, is dropped — so a bad
 * or adversarial completion can only ever produce a smaller valid site, never an
 * unsafe one.
 *
 * Provider: Groq's OpenAI-compatible endpoint (free tier), over plain fetch — no
 * SDK, matching how the storage and rate-limit seams already talk to their
 * services. Swapping providers is a one-function change.
 */
import { getSchema, paletteFor, type PageNode, type PropDef } from "./registry";
import { slugify } from "./slug";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

/**
 * The only prop kinds the model may set: words, links, and safe multiple-choice.
 * NEVER raw numbers — a mis-scaled size or line-height (the block treats it as a
 * percentage, the model writes "1.5") collapses the layout. Everything numeric,
 * every colour, keeps the block's professionally-tuned default.
 */
const SAFE_KINDS = new Set(["text", "textarea", "url", "select", "segment"]);

/** Thrown when no GROQ_API_KEY is configured — the UI turns this into guidance. */
export class AiNotConfiguredError extends Error {}
/** Thrown when the model call or its output failed — the UI offers a retry. */
export class AiFailedError extends Error {}

/** The blocks a fresh, module-less site can actually use — minus media (which needs uploads). */
function allowedSchemas() {
  return paletteFor([]).filter((s) => s.category !== "media");
}

/** A compact catalogue the model composes from: names, one-liners, and content props. */
function catalogue(): string {
  return allowedSchemas()
    .map((s) => {
      const props = Object.entries(s.props)
        .filter(([, p]) => (p.group ?? "content") === "content" && SAFE_KINDS.has(p.kind))
        .map(([key, p]) => {
          const opts =
            (p.kind === "select" || p.kind === "segment") && p.options
              ? `: ${p.options.map((o) => o.value).join(" | ")}`
              : "";
          return `      - ${key} (${p.kind}${opts})`;
        })
        .join("\n");
      const kids = s.acceptsChildren ? " [accepts child blocks]" : "";
      return `• ${s.name}${kids}: ${s.description}${props ? `\n${props}` : ""}`;
    })
    .join("\n");
}

function systemPrompt(cat: string): string {
  return `You are a website builder. Turn the user's one-line description into a small, coherent MULTI-PAGE website for THAT specific business, as JSON.

Use ONLY these block types and their listed prop keys:
${cat}

Return a JSON object of exactly this shape:
{
  "siteName": "<a short brand name, 1-3 words>",
  "pages": [
    { "path": "/", "title": "Home", "blocks": [ { "type": "<BlockType>", "props": { ... }, "children": [ ... ] } ] },
    { "path": "/menu", "title": "Menu", "blocks": [ ... ] }
  ]
}

Rules:
- Build 2 to 4 pages. The FIRST page MUST be the homepage: "path": "/", "title": "Home". Add 1-3 more pages that genuinely fit this business (a café → Menu, About, Visit; a photographer → Portfolio, About, Contact), each with a lowercase path like "/menu" or "/about".
- Make each page RICH: 5 to 7 blocks, and VARY them. Open with a Hero, then mix blocks such as a Feature, a Columns block holding 2-3 Cards, a Stat, a Testimonial, one or two FAQ items, and a Call to action to close. Do not repeat the same block type twice in a row.
- Write REAL, specific, generous copy for this exact business — real headlines, and 1 to 3 full sentences for every body or description. Never lorem ipsum, never placeholders like "[Business Name]" or "Your text here".
- Set ONLY the props listed for each block above — they are the words and the choices. Do NOT invent other props, and never set sizes, spacing, line-height, widths, or colours: those are styled automatically for you.
- Only blocks marked "[accepts child blocks]" may have a "children" array (put Card blocks inside Columns). Every other block is flat with no children.
- Do NOT set any image, photo, or media prop. For any link or href prop, use "#" or another page's path such as "/menu".
- Output ONLY the JSON object. No prose, no markdown code fences.`;
}

interface AiBlock {
  type?: unknown;
  props?: unknown;
  children?: unknown;
}

interface AiPage {
  path?: unknown;
  title?: unknown;
  blocks?: unknown;
}

export interface GeneratedPage {
  path: string;
  title: string;
  blocks: PageNode[];
}

/** Call Groq with a 30s timeout, retrying once on a transient network failure. */
async function callGroqWithRetry(key: string, body: string): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      return await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
    } catch {
      // A blip or a timeout — fall through and try once more, then give up.
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AiFailedError("Could not reach the AI service.");
}

export async function generateSite(
  description: string,
): Promise<{ siteName: string; pages: GeneratedPage[] }> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new AiNotConfiguredError("GROQ_API_KEY is not set");

  const requestBody = JSON.stringify({
    model: MODEL,
    temperature: 0.7,
    max_tokens: 6000, // multi-page JSON with generous copy — room so it never truncates
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt(catalogue()) },
      { role: "user", content: description.slice(0, 400) },
    ],
  });

  const res = await callGroqWithRetry(key, requestBody);
  if (!res.ok) throw new AiFailedError(`The AI service returned ${res.status}.`);

  let content: string;
  try {
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    content = data.choices?.[0]?.message?.content ?? "";
  } catch {
    throw new AiFailedError("The AI returned an unreadable response.");
  }

  let parsed: { siteName?: unknown; pages?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiFailedError("The AI returned invalid JSON.");
  }

  const siteName =
    typeof parsed.siteName === "string" && parsed.siteName.trim()
      ? parsed.siteName.trim().slice(0, 60)
      : "My site";
  const rawPages = Array.isArray(parsed.pages) ? (parsed.pages as AiPage[]) : [];

  let seq = 0;
  const allowed = new Set(allowedSchemas().map((s) => s.name));

  const build = (items: AiBlock[], depth: number): PageNode[] => {
    const out: PageNode[] = [];
    for (const item of items) {
      const type = typeof item?.type === "string" ? item.type : "";
      const schema = getSchema(type);
      if (!schema || !allowed.has(type)) continue;

      const node: PageNode = { id: `ai${++seq}`, type, props: {}, children: [] };
      for (const [k, def] of Object.entries(schema.props)) node.props[k] = def.default;

      const given =
        item.props && typeof item.props === "object"
          ? (item.props as Record<string, unknown>)
          : {};
      for (const [k, v] of Object.entries(given)) {
        const def = schema.props[k];
        if (!def) continue;
        const value = coerce(v, def);
        if (value !== undefined) node.props[k] = value;
      }

      if (schema.acceptsChildren && depth < 2 && Array.isArray(item.children)) {
        node.children = build(item.children as AiBlock[], depth + 1);
      }
      out.push(node);
    }
    return out;
  };

  const pages: GeneratedPage[] = [];
  const seenPaths = new Set<string>();
  for (const rp of rawPages) {
    if (pages.length >= 4) break;
    const blocks = build(Array.isArray(rp?.blocks) ? (rp.blocks as AiBlock[]) : [], 0);
    if (blocks.length === 0) continue;

    // The first surviving page is always the homepage; the rest get a slug path.
    const isHome = pages.length === 0;
    const title = isHome
      ? "Home"
      : typeof rp?.title === "string" && rp.title.trim()
        ? rp.title.trim().slice(0, 60)
        : `Page ${pages.length + 1}`;
    const path = isHome
      ? "/"
      : `/${slugify(String(rp?.path ?? title).replace(/^\//, "")) || "page"}`;
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    pages.push({ path, title, blocks });
  }

  if (pages.length === 0) throw new AiFailedError("The AI produced no usable pages.");
  return { siteName, pages };
}

/**
 * Validate a model's blocks against the registry — identical rules to the site
 * builder: unknown block types and invented props are dropped, so the worst a
 * bad completion can do is return fewer valid blocks, never an unsafe one. Ids
 * are throwaway (insertSection re-mints them on the way into the page).
 */
function buildNodes(items: AiBlock[]): PageNode[] {
  const allowed = new Set(allowedSchemas().map((s) => s.name));
  let seq = 0;
  const build = (list: AiBlock[], depth: number): PageNode[] => {
    const out: PageNode[] = [];
    for (const item of list) {
      const type = typeof item?.type === "string" ? item.type : "";
      const schema = getSchema(type);
      if (!schema || !allowed.has(type)) continue;

      const node: PageNode = { id: `ai${++seq}`, type, props: {}, children: [] };
      for (const [k, def] of Object.entries(schema.props)) node.props[k] = def.default;

      const given =
        item.props && typeof item.props === "object" ? (item.props as Record<string, unknown>) : {};
      for (const [k, v] of Object.entries(given)) {
        const def = schema.props[k];
        if (!def) continue;
        const value = coerce(v, def);
        if (value !== undefined) node.props[k] = value;
      }

      if (schema.acceptsChildren && depth < 2 && Array.isArray(item.children)) {
        node.children = build(item.children as AiBlock[], depth + 1);
      }
      out.push(node);
    }
    return out;
  };
  return build(items, 0);
}

function sectionPrompt(cat: string, siteName?: string): string {
  return `You add ONE cohesive section to an existing web page, as JSON.${
    siteName ? ` The site is called "${siteName}".` : ""
  } Compose the section from these block types and their listed prop keys ONLY:
${cat}

Return a JSON object of exactly this shape:
{ "blocks": [ { "type": "<BlockType>", "props": { ... }, "children": [ ... ] } ] }

Rules:
- Return 1 to 4 blocks that TOGETHER form the section the user asked for, and pick blocks that genuinely fit: a "pricing section" might be a Feature heading plus a Columns holding three Cards; an "FAQ" a couple of FAQ blocks; a "call to action" a single Cta; "testimonials" a Testimonial or a Columns of them.
- Write REAL, specific, generous copy for the user's request — real headings and 1 to 3 full sentences for every body. Never lorem ipsum, never placeholders like "Your text here".
- Set ONLY the props listed for each block above. Do NOT invent props, and never set sizes, spacing, colours, line-height or widths — those are styled automatically.
- Only blocks marked "[accepts child blocks]" may have a "children" array (Cards go inside Columns). Every other block is flat.
- Do NOT set any image, photo or media prop. For any link or href prop use "#" or a path like "/pricing".
- Output ONLY the JSON object. No prose, no markdown code fences.`;
}

/**
 * Compose a single section for the page the user is editing, from a plain-
 * language instruction ("a pricing section with three tiers", "an FAQ about
 * shipping"). Returns validated blocks ready to drop in via insertSection — the
 * same shape the Sections palette uses, so the result is an ordinary, editable
 * part of the page, not a special AI artifact.
 */
export async function generateSection(instruction: string, siteName?: string): Promise<PageNode[]> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new AiNotConfiguredError("GROQ_API_KEY is not set");

  const requestBody = JSON.stringify({
    model: MODEL,
    temperature: 0.7,
    max_tokens: 2500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sectionPrompt(catalogue(), siteName) },
      { role: "user", content: instruction.slice(0, 400) },
    ],
  });

  const res = await callGroqWithRetry(key, requestBody);
  if (!res.ok) throw new AiFailedError(`The AI service returned ${res.status}.`);

  let content: string;
  try {
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    content = data.choices?.[0]?.message?.content ?? "";
  } catch {
    throw new AiFailedError("The AI returned an unreadable response.");
  }

  let parsed: { blocks?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiFailedError("The AI returned invalid JSON.");
  }

  const raw = Array.isArray(parsed.blocks) ? (parsed.blocks as AiBlock[]) : [];
  const blocks = buildNodes(raw);
  if (blocks.length === 0) throw new AiFailedError("The AI produced no usable blocks.");
  return blocks;
}

/** Coerce a model-supplied value to what the prop's kind expects, or drop it. */
function coerce(value: unknown, def: PropDef): unknown {
  switch (def.kind) {
    case "select":
    case "segment": {
      const s = String(value);
      return def.options?.some((o) => o.value === s) ? s : undefined;
    }
    case "text":
    case "textarea":
    case "url":
      return typeof value === "string" ? value.slice(0, 2000) : undefined;
    default:
      // number, range, boolean, color, ref, refList — always keep the block's
      // default. A model-supplied number in the wrong scale is what collapses
      // line-height and breaks the layout; a colour would fight the theme.
      return undefined;
  }
}
