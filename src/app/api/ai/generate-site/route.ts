/**
 * Build a whole site from a one-line description.
 *
 * The magic step: the description goes to the model (see lib/ai.ts), which
 * returns validated blocks; those become a fresh site's homepage via the same
 * createStarterSite path signup uses. So an AI-built site is structurally
 * identical to a hand-built one — every block editable, movable, publishable.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { createSiteFromPages } from "@/lib/onboarding";
import { AiFailedError, AiNotConfiguredError, generateSite } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    select: { orgId: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "No workspace found for your account." }, { status: 400 });
  }

  let payload: { description?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const description = typeof payload.description === "string" ? payload.description.trim() : "";
  if (description.length < 3) {
    return NextResponse.json({ error: "Tell me a little about your site." }, { status: 400 });
  }
  if (description.length > 400) {
    return NextResponse.json({ error: "Keep the description under 400 characters." }, { status: 400 });
  }

  // A language-model call costs compute — throttle per user.
  const rate = await checkRateLimit(`ai-site:${user.id}`, { windowMs: 60_000, max: 5 });
  if (rate.limited) {
    return NextResponse.json({ error: "Give it a moment, then try again." }, { status: 429 });
  }

  let generated: Awaited<ReturnType<typeof generateSite>>;
  try {
    generated = await generateSite(description);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json(
        {
          error:
            "The AI builder isn't switched on yet — no API key is configured. You can still start from a blank site.",
          code: "not_configured",
        },
        { status: 503 },
      );
    }
    if (err instanceof AiFailedError) {
      return NextResponse.json(
        { error: `${err.message} Try again, or reword your description.` },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "Something went wrong building your site." }, { status: 500 });
  }

  const { site, homePageId } = await createSiteFromPages(
    membership.orgId,
    generated.siteName,
    user.id,
    generated.pages,
  );

  return NextResponse.json(
    {
      siteId: site.id,
      siteName: site.name,
      pageId: homePageId || null,
      pageCount: generated.pages.length,
    },
    { status: 201 },
  );
}

