/**
 * Compose one section for the page you're editing, from a plain-language line.
 *
 * The instruction goes to the model (lib/ai.ts), which returns blocks validated
 * against THIS app's registry — the same {type, props} the editor produces. The
 * route persists nothing: it hands the blocks back and the editor drops them in
 * with insertSection, so an AI section is an ordinary, editable, undoable part
 * of the page, indistinguishable from one built by hand.
 */
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { AiFailedError, AiNotConfiguredError, generateSection } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let payload: { instruction?: unknown; siteName?: unknown };
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
    return NextResponse.json({ error: "Describe the section you want." }, { status: 400 });
  }
  if (instruction.length > 400) {
    return NextResponse.json({ error: "Keep it under 400 characters." }, { status: 400 });
  }

  // A model call costs compute — throttle per user, a touch looser than the
  // whole-site builder since a section is a smaller ask.
  const rate = await checkRateLimit(`ai-section:${user.id}`, { windowMs: 60_000, max: 12 });
  if (rate.limited) {
    return NextResponse.json({ error: "Give it a moment, then try again." }, { status: 429 });
  }

  try {
    const blocks = await generateSection(instruction, siteName);
    return NextResponse.json({ blocks });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json(
        { error: "The AI isn't switched on yet — no API key is configured.", code: "not_configured" },
        { status: 503 },
      );
    }
    if (err instanceof AiFailedError) {
      return NextResponse.json(
        { error: `${err.message} Try rewording it.` },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "Something went wrong composing that." }, { status: 500 });
  }
}
