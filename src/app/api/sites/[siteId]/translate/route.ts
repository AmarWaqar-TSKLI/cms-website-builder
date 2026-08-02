/**
 * AI Translate — create translated locale copies of every page, then publish.
 *   GET  → the languages on offer.
 *   POST → { locales: string[] } translate into those, publish as one release.
 */
import { NextResponse } from "next/server";
import { guardSite } from "@/lib/api-auth";
import { translateSite, LOCALES } from "@/lib/translate";
import { AiNotConfiguredError, AiFailedError } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureError } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ locales: LOCALES });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  let body: { locales?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const codes = Array.isArray(body.locales)
    ? body.locales.filter((x): x is string => typeof x === "string").slice(0, 6)
    : [];
  if (!codes.length) return NextResponse.json({ error: "Pick at least one language." }, { status: 400 });

  // Translation fans out to several AI calls; keep it to a few runs a minute.
  const rate = await checkRateLimit(`translate:${auth.user.id}`, { windowMs: 60_000, max: 5 });
  if (rate.limited) return NextResponse.json({ error: "Give it a moment, then try again." }, { status: 429 });

  try {
    const result = await translateSite(siteId, auth.user.id, codes);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: "The AI isn't switched on — no API key configured." }, { status: 503 });
    }
    if (err instanceof AiFailedError) {
      return NextResponse.json({ error: `${err.message} Try again.` }, { status: 502 });
    }
    captureError(err, { scope: "translate", siteId });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Translation failed." },
      { status: 500 },
    );
  }
}
