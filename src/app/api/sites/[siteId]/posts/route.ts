/**
 * A site's blog posts.
 *
 * GET  — every post, newest first, with its status and how many versions it has.
 * POST — create one from a title. It starts as a draft with an empty first
 *        revision; the body is written afterwards through PUT /api/posts/:id.
 *
 * Posts are Tier-2 (live), so nothing here touches releases. What makes a post
 * appear on a published page is a PostList block that references it, frozen at
 * the next publish like any other live data.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSite } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { slugify } from "@/lib/slug";
import { EMPTY_POST_BODY, uniqueSlug } from "@/lib/posts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  const posts = await prisma.post.findMany({
    where: { siteId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { revisions: true } } },
  });

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      status: p.status,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      updatedAt: p.updatedAt.toISOString(),
      revisionCount: p._count.revisions,
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  let payload: { title?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const slug = await uniqueSlug(siteId, slugify(title));

  const post = await prisma.post.create({
    data: { siteId, title, slug, excerpt: "", authorId: userId, status: "draft" },
  });
  const revision = await prisma.postRevision.create({
    data: { postId: post.id, versionNo: 1, body: EMPTY_POST_BODY as never, createdBy: userId },
  });
  await prisma.post.update({
    where: { id: post.id },
    data: { currentRevisionId: revision.id },
  });

  await logActivity({
    siteId,
    userId,
    actorName: auth.user.name,
    action: "post.created",
    entityType: "post",
    entityId: post.id,
    summary: `${auth.user.name} started a post, “${title}”`,
  });

  return NextResponse.json(
    { id: post.id, title: post.title, slug: post.slug, status: post.status },
    { status: 201 },
  );
}
