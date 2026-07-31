/**
 * Rewrite the words on the page you're editing, in place.
 *
 * The editor sends the page's text fields ({id, type, {field: text}}) and an
 * instruction ("make it warmer", "rewrite for luxury buyers"). The model returns
 * new text for the SAME ids and fields (lib/ai.ts), and the editor applies it
 * with updateProps — so nothing structural changes and every edit is undoable.
 * The route persists nothing.
 */
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { AiFailedError, AiNotConfiguredError, rewriteCopy, type CopyField } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let payload: { instruction?: unknown; fields?: unknown; siteName?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const instruction = typeof payload.instruction === "string" ? payload.instruction.trim() : "";
  const siteName =
    typeof payload.siteName === "string" && payload.siteName.trim()
      ? payload.siteName.trim().slice(0, 80)
      : undefined;

  if (instruction.length < 3) {
    return NextResponse.json({ error: "Tell the AI how to rewrite it." }, { status: 400 });
  }
  if (instruction.length > 400) {
    return NextResponse.json({ error: "Keep it under 400 characters." }, { status: 400 });
  }

  // Sanitise the fields the client sent to {id, type, props:{key:string}} — the
  // model only ever gets, and can only ever change, text that already exists.
  const rawFields = Array.isArray(payload.fields) ? payload.fields : [];
  const fields: CopyField[] = [];
  for (const f of rawFields.slice(0, 60)) {
    const id = typeof (f as { id?: unknown })?.id === "string" ? (f as { id: string }).id : "";
    const type = typeof (f as { type?: unknown })?.type === "string" ? (f as { type: string }).type : "";
    const p = (f as { props?: unknown })?.props;
    if (!id || !p || typeof p !== "object") continue;
    const props: Record<string, string> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) props[k] = v.slice(0, 2000);
    }
    if (Object.keys(props).length) fields.push({ id, type, props });
  }
  if (!fields.length) {
    return NextResponse.json({ error: "There's no text on this page to rewrite yet." }, { status: 400 });
  }

  const rate = await checkRateLimit(`ai-rewrite:${user.id}`, { windowMs: 60_000, max: 12 });
  if (rate.limited) {
    return NextResponse.json({ error: "Give it a moment, then try again." }, { status: 429 });
  }

  try {
    const edits = await rewriteCopy(fields, instruction, siteName);
    return NextResponse.json({ edits });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json(
        { error: "The AI isn't switched on yet — no API key is configured.", code: "not_configured" },
        { status: 503 },
      );
    }
    if (err instanceof AiFailedError) {
      return NextResponse.json({ error: `${err.message} Try rewording it.` }, { status: 502 });
    }
    return NextResponse.json({ error: "Something went wrong rewriting that." }, { status: 500 });
  }
}
