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

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

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
        .filter(([, p]) => (p.group ?? "content") === "content")
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
  return `You are a website builder. Turn the user's one-line description into a homepage for THAT specific business, as JSON.

Use ONLY these block types and their listed prop keys:
${cat}

Return a JSON object of exactly this shape:
{
  "siteName": "<a short brand name, 1-3 words>",
  "blocks": [ { "type": "<BlockType>", "props": { ... }, "children": [ ... ] } ]
}

Rules:
- Write REAL, specific copy for this exact business — a real headline, real benefits, a real call to action. Never lorem ipsum, never placeholders like "[Business Name]" or "Your text here".
- Compose a coherent homepage: open with a Hero, then 2-4 sections (features, cards, a stat, a testimonial), and end with a call-to-action. 4 to 7 blocks total.
- Only blocks marked "[accepts child blocks]" may have a "children" array (for example, put Card blocks inside Columns). Every other block is flat with no children.
- Do NOT set any image, photo, or media prop — leave them out; the owner adds pictures later.
- For any link or href prop, use "#".
- Output ONLY the JSON object. No prose, no markdown code fences.`;
}

interface AiBlock {
  type?: unknown;
  props?: unknown;
  children?: unknown;
}

export async function generateSite(
  description: string,
): Promise<{ siteName: string; blocks: PageNode[] }> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new AiNotConfiguredError("GROQ_API_KEY is not set");

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(catalogue()) },
          { role: "user", content: description.slice(0, 400) },
        ],
      }),
    });
  } catch {
    throw new AiFailedError("Could not reach the AI service.");
  }

  if (!res.ok) throw new AiFailedError(`The AI service returned ${res.status}.`);

  let content: string;
  try {
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    content = data.choices?.[0]?.message?.content ?? "";
  } catch {
    throw new AiFailedError("The AI returned an unreadable response.");
  }

  let parsed: { siteName?: unknown; blocks?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiFailedError("The AI returned invalid JSON.");
  }

  const siteName =
    typeof parsed.siteName === "string" && parsed.siteName.trim()
      ? parsed.siteName.trim().slice(0, 60)
      : "My site";
  const rawBlocks = Array.isArray(parsed.blocks) ? (parsed.blocks as AiBlock[]) : [];

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

  const blocks = build(rawBlocks, 0);
  if (blocks.length === 0) throw new AiFailedError("The AI produced no usable blocks.");
  return { siteName, blocks };
}

/** Coerce a model-supplied value to what the prop's kind expects, or drop it. */
function coerce(value: unknown, def: PropDef): unknown {
  switch (def.kind) {
    case "number":
    case "range": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean":
      return typeof value === "boolean" ? value : value === "true";
    case "select":
    case "segment": {
      const s = String(value);
      return def.options?.some((o) => o.value === s) ? s : undefined;
    }
    case "ref":
    case "refList":
      // Never let the model invent a reference to live data (a product, a post).
      return undefined;
    default:
      // text / textarea / url / color
      return typeof value === "string" ? value.slice(0, 2000) : undefined;
  }
}
