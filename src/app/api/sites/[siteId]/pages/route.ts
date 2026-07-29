/**
 * A site's pages — creating one, and listing them.
 *
 * A page is identity only (path, title); its content lives in a draft and, once
 * published, in revisions. Creating a page here writes the Page row and an EMPTY
 * draft, so the new page opens ready to build on. Nothing is versioned until the
 * first publish, exactly like the seeded pages.
 *
 * Paths are made unique per site (the partial unique index enforces it too), so
 * "Contact" and a second "Contact" become /contact and /contact-2 rather than a
 * 500.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSite } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { slugify } from "@/lib/slug";
import { toJson } from "@/lib/json";

export const dynamic = "force-dynamic";

const EMPTY_BODY = { version: 1, root: [] as unknown[] };

/** First free path from a base, appending -2, -3, … like the slug helper does. */
async function uniquePath(siteId: string, base: string): Promise<string> {
  for (let i = 1; i < 200; i++) {
    const path = i === 1 ? base : `${base}-${i}`;
    const clash = await prisma.page.findFirst({
      where: { siteId, path, deletedAt: null },
      select: { id: true },
    });
    if (!clash) return path;
  }
  return `${base}-${Date.now()}`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  const pages = await prisma.page.findMany({
    where: { siteId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, path: true, title: true },
  });
  return NextResponse.json({ pages });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  let payload: { title?: unknown; path?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Give your page a name." }, { status: 400 });

  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // The path is derived from the name unless one was given explicitly.
  const rawPath =
    typeof payload.path === "string" && payload.path.trim()
      ? payload.path.trim().replace(/^\/?/, "/")
      : `/${slugify(title) || "page"}`;
  const path = await uniquePath(siteId, rawPath);

  const page = await prisma.page.create({
    data: { siteId, path, type: "page", title: title.slice(0, 120) },
  });
  await prisma.pageDraft.create({
    data: { pageId: page.id, updatedBy: userId, body: toJson(EMPTY_BODY) },
  });

  await logActivity({
    siteId,
    userId,
    actorName: auth.user.name,
    action: "page.created",
    entityType: "page",
    entityId: page.id,
    summary: `${auth.user.name} created the page ${path}`,
  });

  return NextResponse.json(
    { id: page.id, path: page.path, title: page.title },
    { status: 201 },
  );
}
