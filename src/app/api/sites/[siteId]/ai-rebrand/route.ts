/**
 * POST /api/sites/:id/ai-rebrand
 *
 * Rewrite the whole site's copy and restyle its theme to a described vibe, then
 * publish it as one release (lib/rebrand.ts). Returns the new release the same
 * way /publish does, so the dashboard can watch it build and go live — and one
 * rollback undoes the entire rebrand, because it is exactly one release.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSite } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { checkRateLimit } from "@/lib/rate-limit";
import { AiFailedError, AiNotConfiguredError } from "@/lib/ai";
import { rebrandSite } from "@/lib/rebrand";
import { captureError } from "@/lib/monitor";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  let payload: { instruction?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const instruction = typeof payload.instruction === "string" ? payload.instruction.trim() : "";
  if (instruction.length < 3) {
    return NextResponse.json({ error: "Describe the new look and tone." }, { status: 400 });
  }
  if (instruction.length > 400) {
    return NextResponse.json({ error: "Keep it under 400 characters." }, { status: 400 });
  }

  // A rebrand is two model calls plus a publish — throttle harder than a single
  // section.
  const rate = await checkRateLimit(`ai-rebrand:${auth.user.id}`, { windowMs: 60_000, max: 4 });
  if (rate.limited) {
    return NextResponse.json({ error: "Give it a moment, then try again." }, { status: 429 });
  }

  try {
    const result = await rebrandSite(siteId, auth.user.id, instruction);

    await logActivity({
      siteId,
      userId: auth.user.id,
      actorName: auth.user.name,
      action: "site.published",
      entityType: "release",
      entityId: result.releaseId,
      summary: `${auth.user.name} rebranded the site with AI (v${result.versionNo})`,
      meta: {
        versionNo: result.versionNo,
        instruction,
        componentsRewritten: result.componentsRewritten,
        fieldsRewritten: result.fieldsRewritten,
        themeChanged: result.themeChanged,
      },
    });

    return NextResponse.json({
      releaseId: result.releaseId,
      versionNo: result.versionNo,
      componentsRewritten: result.componentsRewritten,
      fieldsRewritten: result.fieldsRewritten,
      themeChanged: result.themeChanged,
    });
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
    captureError(err, { scope: "ai.rebrand", siteId });
    return NextResponse.json({ error: "Something went wrong rebranding the site." }, { status: 500 });
  }
}
