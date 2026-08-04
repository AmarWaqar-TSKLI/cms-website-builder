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
import { guardSite, guardSiteOwner } from "@/lib/api-auth";
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

/**
 * Delete (archive) a site. A hard delete is impossible on purpose: revisions and
 * the activity log are append-only (a DB trigger forbids DELETE), which is what
 * makes published versions immutable. So this sets `deletedAt` — the site drops
 * out of every list and stops serving — and frees its slug and domain for reuse.
 * Nothing published is destroyed, so it stays recoverable.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  // Deleting a site is an OWNER action; editors build, owners destroy.
  const auth = await guardSiteOwner(siteId);
  if (!auth.ok) return auth.response;

  try {
    const site = await prisma.site.findUnique({ where: { id: siteId }, select: { slug: true } });
    if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });

    await prisma.site.update({
      where: { id: siteId },
      data: {
        deletedAt: new Date(),
        customDomain: null, // free the domain
        slug: `${site.slug}-deleted-${Date.now().toString(36)}`.slice(0, 120), // free the slug
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    captureError(err, { scope: "site.delete", siteId });
    return NextResponse.json({ error: "Couldn't delete the site." }, { status: 500 });
  }
}
