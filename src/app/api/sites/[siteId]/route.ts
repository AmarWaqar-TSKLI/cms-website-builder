/**
 * The site itself — for now, its display name.
 *
 * Renaming changes what people see in the dashboard, the site switcher and the
 * editor's top bar. It deliberately does NOT touch the slug: /s/<slug> (and any
 * custom domain) is the site's stable public address, and a rename must never
 * break a link that is already out in the world. Name is the label; slug is the
 * identity.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSite } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { captureError } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  let payload: { name?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof payload.name !== "string") {
    return NextResponse.json({ error: "Enter a name." }, { status: 400 });
  }
  // Same bound the create endpoint uses, so a name set here and a name set there
  // behave identically.
  const name = payload.name.trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "A site needs a name." }, { status: 400 });

  try {
    const site = await prisma.site.update({
      where: { id: siteId },
      data: { name },
      select: { id: true, name: true, slug: true },
    });

    await logActivity({
      siteId,
      userId: auth.user.id,
      actorName: auth.user.name,
      action: "site.renamed",
      entityType: "site",
      entityId: siteId,
      summary: `${auth.user.name} renamed the site to “${name}”`,
    });

    return NextResponse.json(site);
  } catch (err) {
    captureError(err, { scope: "site.rename", siteId });
    return NextResponse.json({ error: "Couldn't rename the site." }, { status: 500 });
  }
}
