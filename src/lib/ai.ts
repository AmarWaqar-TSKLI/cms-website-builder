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
import type { ThemeTokens } from "./registry/types";
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

/** What every feature sends: the model id and provider mechanics live in chat(). */
interface ChatPayload {
  temperature: number;
  max_tokens: number;
  messages: { role: "system" | "user"; content: string }[];
}

/** One provider attempt with a 30s timeout. Throws on network failure. */
async function attempt(
  url: string,
  key: string,
  model: string,
  payload: ChatPayload,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, response_format: { type: "json_object" }, ...payload }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Call the model and return the completion's content string.
 *
 * Resilience lives here so every feature gets it for free:
 *   - 429/5xx and network blips retry with a short backoff (Groq's free tier
 *     rate-limits at the worst moments; one polite retry usually clears it);
 *   - an OPTIONAL fallback provider (AI_FALLBACK_URL/KEY/MODEL — any
 *     OpenAI-compatible endpoint) takes over when the primary is down or still
 *     throttled. Env-gated like every other integration: unset, nothing changes.
 */
async function chat(payload: ChatPayload): Promise<string> {
  const primaryKey = process.env.GROQ_API_KEY?.trim();
  const fbUrl = process.env.AI_FALLBACK_URL?.trim();
  const fbKey = process.env.AI_FALLBACK_KEY?.trim();
  const fbModel = process.env.AI_FALLBACK_MODEL?.trim();
  const fallbackConfigured = !!(fbUrl && fbKey && fbModel);
  if (!primaryKey && !fallbackConfigured) throw new AiNotConfiguredError("GROQ_API_KEY is not set");

  let lastStatus = 0;
  if (primaryKey) {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await attempt(GROQ_URL, primaryKey, MODEL, payload);
        if (res.ok) return contentOf(res);
        lastStatus = res.status;
        // 4xx other than 429 won't get better by retrying the same request.
        if (res.status !== 429 && res.status < 500) break;
      } catch {
        /* network blip or timeout — retry, then fall back */
      }
      if (i < 2) await sleep(500 * (i + 1) ** 2);
    }
  }

  if (fallbackConfigured) {
    try {
      const res = await attempt(fbUrl!, fbKey!, fbModel!, payload);
      if (res.ok) return contentOf(res);
      lastStatus = res.status;
    } catch {
      /* fall through to the error below */
    }
  }

  throw new AiFailedError(
    lastStatus ? `The AI service returned ${lastStatus}.` : "Could not reach the AI service.",
  );
}

/** The completion's content, or a typed failure — never a half-parsed response. */
async function contentOf(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === "string" && content) return content;
  } catch {
    /* fall through */
  }
  throw new AiFailedError("The AI returned an unreadable response.");
}

export async function generateSite(
  description: string,
): Promise<{ siteName: string; pages: GeneratedPage[] }> {
  const content = await chat({
    temperature: 0.7,
    max_tokens: 6000, // multi-page JSON with generous copy — room so it never truncates
    messages: [
      { role: "system", content: systemPrompt(catalogue()) },
      { role: "user", content: description.slice(0, 400) },
    ],
  });

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
  const content = await chat({
    temperature: 0.7,
    max_tokens: 2500,
    messages: [
      { role: "system", content: sectionPrompt(catalogue(), siteName) },
      { role: "user", content: instruction.slice(0, 400) },
    ],
  });

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

/** One block's editable text, as sent to the model for an in-place rewrite. */
export interface CopyField {
  id: string;
  type: string;
  props: Record<string, string>;
}

/**
 * Rewrite the WORDS on a page in place, changing nothing structural.
 *
 * The page's text fields go to the model as {id, type, {field: currentText}};
 * it returns new text for the SAME ids and field names. It cannot add, remove
 * or reorder blocks, and the caller only accepts edits whose id and field were
 * in what we sent — so the worst a bad completion can do is reword some fields
 * oddly (one undo fixes it), never restructure or break the page. The editor
 * applies the result with updateProps, so a rewrite is just a batch of the same
 * prop edits a person makes by hand.
 */
export async function rewriteCopy(
  fields: CopyField[],
  instruction: string,
  siteName?: string,
): Promise<{ id: string; props: Record<string, string> }[]> {
  if (!fields.length) return [];

  const system = `You rewrite the words on an existing web page, in place.${
    siteName ? ` The site is called "${siteName}".` : ""
  } You are given the page's text fields as a JSON array; each item has an "id", a block "type", and one or more named fields holding the CURRENT text. Apply the user's instruction to the WORDING only.

Return a JSON object of exactly this shape:
{ "edits": [ { "id": "<the same id>", "props": { "<fieldName>": "<new text>" } } ] }

Rules:
- Keep the SAME ids and the SAME field names — only change the text values.
- Rewrite every field the instruction implies; simply omit a field that should stay unchanged.
- Keep each field's PURPOSE and roughly its length: a headline stays a short headline, a paragraph stays a paragraph. Never return empty text.
- Write real, specific, natural copy for this exact business. No placeholders, no lorem ipsum, no markdown.
- Output ONLY the JSON object. No prose, no code fences.`;

  const user = `Instruction: ${instruction.slice(0, 400)}\n\nText fields:\n${JSON.stringify(fields).slice(0, 12000)}`;

  const content = await chat({
    temperature: 0.6,
    max_tokens: 4000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  let parsed: { edits?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiFailedError("The AI returned invalid JSON.");
  }

  // Only accept edits whose id AND field names were in what we sent — the model
  // can supply new TEXT for an existing field, never a new node or a new prop.
  const allowed = new Map(fields.map((f) => [f.id, new Set(Object.keys(f.props))]));
  const rawEdits = Array.isArray(parsed.edits) ? parsed.edits : [];
  const edits: { id: string; props: Record<string, string> }[] = [];
  for (const e of rawEdits) {
    const id = typeof (e as { id?: unknown })?.id === "string" ? (e as { id: string }).id : "";
    const keys = allowed.get(id);
    if (!keys) continue;
    const given = (e as { props?: unknown })?.props;
    if (!given || typeof given !== "object") continue;
    const props: Record<string, string> = {};
    for (const [k, v] of Object.entries(given as Record<string, unknown>)) {
      if (keys.has(k) && typeof v === "string" && v.trim()) props[k] = v.slice(0, 2000);
    }
    if (Object.keys(props).length) edits.push({ id, props });
  }
  if (!edits.length) throw new AiFailedError("The AI didn't return any usable changes.");
  return edits;
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const THEME_COLOR_KEYS = [
  "colorBg",
  "colorFg",
  "colorMuted",
  "colorAccent",
  "colorAccentFg",
  "colorSurface",
  "colorBorder",
] as const;

/**
 * Restyle a site's theme tokens to match a vibe ("dark luxury", "warm and
 * playful"). Given the current tokens and an instruction, the model proposes a
 * new palette + fonts. Every value is STRICTLY validated here — colours must be
 * 6-digit hex, radius a length, fonts short strings — because these become raw
 * CSS custom properties; a malformed value would break the page, so a bad one
 * is dropped and the token keeps its current value.
 */
export async function rebrandTheme(
  current: ThemeTokens,
  instruction: string,
): Promise<Partial<ThemeTokens>> {
  const system = `You restyle a website's theme to match a vibe. You get the CURRENT design tokens and an instruction; return NEW tokens as JSON.

Tokens (all are raw CSS values):
- colorBg: page background — hex #rrggbb
- colorFg: main text — hex
- colorMuted: secondary/subtle text — hex
- colorAccent: brand & button colour — hex
- colorAccentFg: text placed ON the accent — hex
- colorSurface: card / panel background — hex
- colorBorder: hairline borders — hex
- fontHeading: a CSS font-family stack for headings
- fontBody: a CSS font-family stack for body text
- radius: corner radius, a CSS length like "10px" or "0px"

Return a JSON object with ALL of those keys.

Rules:
- Choose a COHERENT, professional palette for the vibe. Contrast must be strong and readable: colorFg on colorBg, and colorAccentFg on colorAccent.
- Colours MUST be 6-digit hex (#rrggbb). radius a px value. Fonts real CSS stacks, e.g. "Georgia, 'Times New Roman', serif" or "'Helvetica Neue', Arial, sans-serif".
- Output ONLY the JSON object. No prose, no code fences.`;

  const user = `Instruction: ${instruction.slice(0, 400)}\n\nCurrent tokens:\n${JSON.stringify({
    colorBg: current.colorBg,
    colorFg: current.colorFg,
    colorMuted: current.colorMuted,
    colorAccent: current.colorAccent,
    colorAccentFg: current.colorAccentFg,
    colorSurface: current.colorSurface,
    colorBorder: current.colorBorder,
    fontHeading: current.fontHeading,
    fontBody: current.fontBody,
    radius: current.radius,
  })}`;

  const content = await chat({
    temperature: 0.6,
    max_tokens: 800,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new AiFailedError("The AI returned invalid JSON.");
  }

  const out: Partial<ThemeTokens> = {};
  for (const k of THEME_COLOR_KEYS) {
    const v = parsed[k];
    if (typeof v === "string" && HEX6.test(v.trim())) out[k] = v.trim();
  }
  for (const k of ["fontHeading", "fontBody"] as const) {
    const v = parsed[k];
    if (typeof v === "string" && v.trim() && v.trim().length <= 200) out[k] = v.trim();
  }
  const radius = parsed.radius;
  if (typeof radius === "string" && /^\d{1,3}(px|rem|em|%)?$/.test(radius.trim())) {
    out.radius = radius.trim();
  }

  if (Object.keys(out).length === 0) throw new AiFailedError("The AI didn't return a usable palette.");
  return out;
}

/** One proposed brand concept: a name, a rebrand instruction, a palette, a sample. */
export interface BrandDirection {
  name: string;
  vibe: string;
  sampleHeadline: string;
  tokens: {
    colorBg: string;
    colorFg: string;
    colorAccent: string;
    colorSurface: string;
  };
}

/**
 * Propose THREE distinct brand directions for a site, each with a palette
 * preview and a sample headline. It's the pick-one step in front of a full
 * rebrand: the chosen direction's `vibe` is exactly what /ai-rebrand takes. All
 * colours are strictly validated (a non-hex value drops the whole direction),
 * so a preview swatch can never be a broken colour.
 */
export async function brandDirections(siteName?: string): Promise<BrandDirection[]> {
  const system = `You are a brand director. Propose THREE genuinely different brand directions for a website, as JSON.

Return exactly:
{ "directions": [
  { "name": "<2-4 word direction name>", "vibe": "<one sentence describing the look and tone, phrased as an instruction like 'a dark, bold, high-contrast tech brand'>", "sampleHeadline": "<a homepage headline, 4-9 words, written in this direction>", "tokens": { "colorBg":"#rrggbb", "colorFg":"#rrggbb", "colorAccent":"#rrggbb", "colorSurface":"#rrggbb" } }
] }

Rules:
- The THREE directions must be clearly DIFFERENT from each other — e.g. one dark and bold, one warm and editorial, one clean and minimal.
- Colours MUST be 6-digit hex (#rrggbb) with strong, readable contrast between colorFg and colorBg.
- sampleHeadline and name must be real and specific — no placeholders, no lorem ipsum.
- Output ONLY the JSON object. No prose, no code fences.`;

  const content = await chat({
    temperature: 0.85,
    max_tokens: 1200,
    messages: [
      { role: "system", content: system },
      { role: "user", content: siteName ? `The site is called "${siteName}".` : "A small business website." },
    ],
  });

  let parsed: { directions?: unknown };
  try {
    parsed = JSON.parse(content) as { directions?: unknown };
  } catch {
    throw new AiFailedError("The AI returned invalid JSON.");
  }

  const raw = Array.isArray(parsed.directions) ? parsed.directions : [];
  const directions: BrandDirection[] = [];
  for (const d of raw) {
    const name = typeof (d as { name?: unknown })?.name === "string" ? (d as { name: string }).name.trim().slice(0, 40) : "";
    const vibe = typeof (d as { vibe?: unknown })?.vibe === "string" ? (d as { vibe: string }).vibe.trim().slice(0, 200) : "";
    const sampleHeadline =
      typeof (d as { sampleHeadline?: unknown })?.sampleHeadline === "string"
        ? (d as { sampleHeadline: string }).sampleHeadline.trim().slice(0, 120)
        : "";
    const t = (d as { tokens?: unknown })?.tokens as Record<string, unknown> | undefined;
    if (!name || !vibe || !sampleHeadline || !t) continue;
    const hex = (v: unknown) => (typeof v === "string" && HEX6.test(v.trim()) ? v.trim() : null);
    const colorBg = hex(t.colorBg);
    const colorFg = hex(t.colorFg);
    const colorAccent = hex(t.colorAccent);
    const colorSurface = hex(t.colorSurface) ?? colorBg;
    if (!colorBg || !colorFg || !colorAccent || !colorSurface) continue;
    directions.push({ name, vibe, sampleHeadline, tokens: { colorBg, colorFg, colorAccent, colorSurface } });
    if (directions.length === 3) break;
  }

  if (directions.length === 0) throw new AiFailedError("The AI didn't return usable directions.");
  return directions;
}

/** One recommended section the AI thinks this page should have next. */
export interface PagePlanItem {
  title: string;
  why: string;
  blocks: PageNode[];
}

/**
 * The agentic builder's brain: look at what's already on a page and plan the
 * sections it still NEEDS to be a complete, high-converting page of its kind —
 * in order, each with a reason and real composed copy. It's context-aware (it
 * won't re-suggest a hero if there's already one) and, like every other AI path
 * here, bounded to the registry: a recommendation can only ever be valid blocks.
 */
export async function planPage(
  existingTypes: string[],
  siteName?: string,
  pageTitle?: string,
): Promise<PagePlanItem[]> {
  const system = `You are an expert web designer and conversion copywriter helping build ONE page. Given what's already on the page and the site, recommend the NEXT sections this page needs to be complete, professional and high-converting — in the order they should appear.

Compose the section from these block types and their listed prop keys ONLY:
${catalogue()}

Return a JSON object of exactly this shape:
{ "recommendations": [ { "title": "<2-4 word section name>", "why": "<one sentence on why this page needs it>", "blocks": [ { "type": "<BlockType>", "props": { ... }, "children": [ ... ] } ] } ] }

Rules:
- Recommend 3 to 4 sections, each genuinely useful for THIS page's purpose, in the order they should appear down the page.
- Recommend sections that are MISSING. Do NOT re-suggest a section type the page already has, unless a great page of this kind clearly needs a second one.
- Each recommendation is 1 to 4 blocks with REAL, specific copy for this exact business — real headings and full sentences, never placeholders.
- Set ONLY the listed props. Never set sizes, spacing, colours or widths, and never set an image/media prop. For links use "#" or a path.
- Only blocks marked "[accepts child blocks]" may have "children".
- Output ONLY the JSON object. No prose, no code fences.`;

  const user = `Site: "${siteName ?? "this business"}". Page: "${pageTitle ?? "a page"}". Already on the page, in order: [${
    existingTypes.length ? existingTypes.join(", ") : "nothing yet — an empty page"
  }].`;

  const content = await chat({
    temperature: 0.7,
    max_tokens: 5000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  let parsed: { recommendations?: unknown };
  try {
    parsed = JSON.parse(content) as { recommendations?: unknown };
  } catch {
    throw new AiFailedError("The AI returned invalid JSON.");
  }

  const raw = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
  const out: PagePlanItem[] = [];
  for (const r of raw) {
    const title = typeof (r as { title?: unknown })?.title === "string" ? (r as { title: string }).title.trim().slice(0, 48) : "";
    const why = typeof (r as { why?: unknown })?.why === "string" ? (r as { why: string }).why.trim().slice(0, 160) : "";
    const rawBlocks = Array.isArray((r as { blocks?: unknown })?.blocks) ? ((r as { blocks: AiBlock[] }).blocks) : [];
    const blocks = buildNodes(rawBlocks);
    if (title && blocks.length) out.push({ title, why, blocks });
    if (out.length === 4) break;
  }

  if (out.length === 0) throw new AiFailedError("The AI didn't return usable recommendations.");
  return out;
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
