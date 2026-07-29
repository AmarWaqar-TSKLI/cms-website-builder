/**
 * The user's sites collection.
 *
 * POST creates a fresh blank site (the friendly starter template) under the
 * user's workspace and returns its id + home page — the "New blank site" action
 * on the hub. AI-built sites go through /api/ai/generate-site instead.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { createStarterSite } from "@/lib/onboarding";

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
  try {
    const body = (await req.json()) as { name?: unknown };
    if (typeof body.name === "string" && body.name.trim()) name = body.name.trim().slice(0, 60);
  } catch {
    /* default name is fine */
  }

  const site = await createStarterSite(membership.orgId, name, user.id);
  const home = await prisma.page.findFirst({
    where: { siteId: site.id, path: "/", deletedAt: null },
    select: { id: true },
  });

  return NextResponse.json({ siteId: site.id, pageId: home?.id ?? null }, { status: 201 });
}
