/**
 * The user's sites collection.
 *
 * POST creates a fresh site under the user's workspace and returns its id + home
 * page. With no `templateId` it's the friendly blank starter ("New blank site");
 * with one, it's built from a designed template (the template gallery). AI-built
 * sites go through /api/ai/generate-site instead. All three land in the editor.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { createSiteFromPages, createStarterSite } from "@/lib/onboarding";
import { getTemplate } from "@/lib/templates";

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

  let name = "Untitled site";
  let templateId: string | null = null;
  try {
    const body = (await req.json()) as { name?: unknown; templateId?: unknown };
    if (typeof body.name === "string" && body.name.trim()) name = body.name.trim().slice(0, 60);
    if (typeof body.templateId === "string" && body.templateId.trim()) templateId = body.templateId.trim();
  } catch {
    /* default name, no template is fine */
  }

  // A template builds a whole multi-page site with its own look; the blank path
  // builds the friendly one-page starter. Both are ordinary sites afterwards.
  if (templateId) {
    const template = getTemplate(templateId);
    if (!template) {
      return NextResponse.json({ error: "That template doesn't exist." }, { status: 404 });
    }
    const siteName = name !== "Untitled site" ? name : template.name;
    const { site, homePageId } = await createSiteFromPages(
      membership.orgId,
      siteName,
      user.id,
      template.pages,
      template.tokens,
    );
    return NextResponse.json({ siteId: site.id, pageId: homePageId || null }, { status: 201 });
  }

  const site = await createStarterSite(membership.orgId, name, user.id);
  const home = await prisma.page.findFirst({
    where: { siteId: site.id, path: "/", deletedAt: null },
    select: { id: true },
  });

  return NextResponse.json({ siteId: site.id, pageId: home?.id ?? null }, { status: 201 });
}
