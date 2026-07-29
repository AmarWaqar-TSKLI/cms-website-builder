/**
 * Rename or delete a page.
 *
 * PATCH { title } — renames the page. Only the human name changes; the web
 *   address (path) stays put, so no published link ever breaks from a rename.
 * DELETE — a SOFT delete (sets deleted_at), like products and posts. A published
 *   release that was built with this page keeps working; the page just leaves the
 *   editor and the live site's navigation. A site must keep at least one page.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardPage } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const auth = await guardPage(pageId);
  if (!auth.ok) return auth.response;

  let payload: { title?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Give the page a name." }, { status: 400 });

  const page = await prisma.page.update({
    where: { id: pageId },
    data: { title: title.slice(0, 120) },
    select: { id: true, title: true, path: true },
  });

  await logActivity({
    siteId: auth.extra.siteId,
    userId: auth.user.id,
    actorName: auth.user.name,
    action: "page.edited",
    entityType: "page",
    entityId: pageId,
    summary: `${auth.user.name} renamed a page to “${page.title}”`,
  });

  return NextResponse.json(page);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const auth = await guardPage(pageId);
  if (!auth.ok) return auth.response;
  const { siteId } = auth.extra;

  // A site with no pages has nothing to serve — refuse the last one.
  const live = await prisma.page.count({ where: { siteId, deletedAt: null } });
  if (live <= 1) {
    return NextResponse.json({ error: "This is your only page — a site needs at least one." }, { status: 409 });
  }

  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { path: true } });
  await prisma.page.update({ where: { id: pageId }, data: { deletedAt: new Date() } });

  await logActivity({
    siteId,
    userId: auth.user.id,
    actorName: auth.user.name,
    action: "page.deleted",
    entityType: "page",
    entityId: pageId,
    summary: `${auth.user.name} deleted the page ${page?.path ?? ""}`,
  });

  return NextResponse.json({ ok: true });
}
