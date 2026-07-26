/**
 * One post: read it, edit it, or remove it.
 *
 * GET    — the post plus the text of its current version.
 * PUT    — update the title, slug and summary; if the body text changed, append
 *          a new revision and point the post at it. Every body change is a
 *          version, which is the whole reason posts have revisions.
 * DELETE — soft delete. Any page that already froze this post keeps its copy; a
 *          PostList that referenced it simply drops it at the next publish.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardPost } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { slugify } from "@/lib/slug";
import { bodyTextOf, uniqueSlug } from "@/lib/posts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const auth = await guardPost(postId);
  if (!auth.ok) return auth.response;

  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
    include: { revisions: { orderBy: { versionNo: "desc" }, take: 1 } },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    status: post.status,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    body: bodyTextOf(post.revisions[0]?.body),
    versionNo: post.revisions[0]?.versionNo ?? 0,
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const auth = await guardPost(postId);
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  let payload: { title?: unknown; slug?: unknown; excerpt?: unknown; body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
    include: { revisions: { orderBy: { versionNo: "desc" }, take: 1 } },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { title?: string; slug?: string; excerpt?: string } = {};
  if (typeof payload.title === "string" && payload.title.trim()) data.title = payload.title.trim();
  if (typeof payload.excerpt === "string") data.excerpt = payload.excerpt.trim().slice(0, 400);
  if (typeof payload.slug === "string" && payload.slug.trim()) {
    const wanted = slugify(payload.slug);
    if (wanted && wanted !== post.slug) data.slug = await uniqueSlug(post.siteId, wanted, post.id);
  }

  // A changed body becomes a new version; an unchanged one costs nothing.
  if (typeof payload.body === "string") {
    const current = bodyTextOf(post.revisions[0]?.body);
    if (payload.body !== current) {
      const nextVersion = (post.revisions[0]?.versionNo ?? 0) + 1;
      const revision = await prisma.postRevision.create({
        data: {
          postId: post.id,
          versionNo: nextVersion,
          body: { version: 1, text: payload.body },
          createdBy: userId,
        },
      });
      await prisma.post.update({
        where: { id: post.id },
        data: { currentRevisionId: revision.id },
      });
    }
  }

  if (Object.keys(data).length) {
    await prisma.post.update({ where: { id: post.id }, data });
  }

  const fresh = await prisma.post.findUnique({ where: { id: post.id } });
  return NextResponse.json({
    id: fresh!.id,
    title: fresh!.title,
    slug: fresh!.slug,
    excerpt: fresh!.excerpt,
    status: fresh!.status,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const auth = await guardPost(postId);
  if (!auth.ok) return auth.response;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, title: true, deletedAt: true },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!post.deletedAt) {
    await prisma.post.update({ where: { id: postId }, data: { deletedAt: new Date() } });
    await logActivity({
      siteId: auth.extra.siteId,
      userId: auth.user.id,
      actorName: auth.user.name,
      action: "post.deleted",
      entityType: "post",
      entityId: postId,
      summary: `${auth.user.name} deleted the post “${post.title}”`,
    });
  }

  return NextResponse.json({ ok: true });
}
