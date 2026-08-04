/**
 * The agentic builder's endpoint: given what's already on the page, plan the
 * sections it still needs. Returns registry-validated blocks per recommendation,
 * so the editor can drop any of them in with insertSection — the same first-class
 * blocks as everything else. Persists nothing.
 */
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { AiFailedError, AiNotConfiguredError, planPage, type PageSectionSummary } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let payload: {
    sections?: unknown;
    existingTypes?: unknown;
    avoid?: unknown;
    siteName?: unknown;
    pageTitle?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Rich shape: [{type, text}] — the page's actual content. The old bare
  // `existingTypes` list still works (text-less) so nothing external breaks.
  const sections: PageSectionSummary[] = Array.isArray(payload.sections)
    ? payload.sections
        .filter(
          (s): s is { type: string; text?: unknown } =>
            !!s && typeof s === "object" && typeof (s as { type?: unknown }).type === "string",
        )
        .slice(0, 40)
        .map((s) => ({
          type: s.type.slice(0, 40),
          text: typeof s.text === "string" ? s.text.slice(0, 160) : "",
        }))
    : Array.isArray(payload.existingTypes)
      ? payload.existingTypes
          .filter((t): t is string => typeof t === "string")
          .slice(0, 40)
          .map((type) => ({ type: type.slice(0, 40), text: "" }))
      : [];

  const avoid = Array.isArray(payload.avoid)
    ? payload.avoid.filter((a): a is string => typeof a === "string").slice(0, 20).map((a) => a.slice(0, 60))
    : [];
  const siteName =
    typeof payload.siteName === "string" && payload.siteName.trim()
      ? payload.siteName.trim().slice(0, 80)
      : undefined;
  const pageTitle =
    typeof payload.pageTitle === "string" && payload.pageTitle.trim()
      ? payload.pageTitle.trim().slice(0, 80)
      : undefined;

  const rate = await checkRateLimit(`ai-plan:${user.id}`, { windowMs: 60_000, max: 10 });
  if (rate.limited) {
    return NextResponse.json({ error: "Give it a moment, then try again." }, { status: 429 });
  }

  try {
    const recommendations = await planPage(sections, siteName, pageTitle, avoid);
    return NextResponse.json({ recommendations });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json(
        { error: "The AI isn't switched on yet — no API key is configured.", code: "not_configured" },
        { status: 503 },
      );
    }
    if (err instanceof AiFailedError) {
      return NextResponse.json({ error: `${err.message} Try again.` }, { status: 502 });
    }
    return NextResponse.json({ error: "Something went wrong planning the page." }, { status: 500 });
  }
}
