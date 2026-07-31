/**
 * POST /api/sites/:id/ai-directions
 *
 * Propose three brand directions (name + palette + sample headline) to pick from
 * before committing to a full rebrand. Persists nothing — the chosen direction's
 * `vibe` is handed to /ai-rebrand, which does the real work.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSite } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { AiFailedError, AiNotConfiguredError, brandDirections } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  const rate = await checkRateLimit(`ai-directions:${auth.user.id}`, { windowMs: 60_000, max: 8 });
  if (rate.limited) {
    return NextResponse.json({ error: "Give it a moment, then try again." }, { status: 429 });
  }

  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { name: true } });

  try {
    const directions = await brandDirections(site?.name ?? undefined);
    return NextResponse.json({ directions });
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
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
