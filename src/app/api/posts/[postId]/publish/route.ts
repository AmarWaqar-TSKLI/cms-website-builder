/**
 * Publish or unpublish a post.
 *
 * A post's status is what decides whether it can appear on a page: only
 * published posts are offered in the PostList picker and frozen at build time.
 * Publishing stamps the date the first time; unpublishing keeps it, so a post
 * put back doesn't lose its original date.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardPost } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const auth = await guardPost(postId);
  if (!auth.ok) return auth.response;

  let payload: { published?: unknown };
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const published = payload.published !== false; // default: publish

  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
    select: { id: true, title: true, publishedAt: true },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.post.update({
    where: { id: postId },
    data: {
      status: published ? "published" : "draft",
      publishedAt: published ? (post.publishedAt ?? new Date()) : post.publishedAt,
    },
  });

  if (published) {
    await logActivity({
      siteId: auth.extra.siteId,
      userId: auth.user.id,
      actorName: auth.user.name,
      action: "post.published",
      entityType: "post",
      entityId: postId,
      summary: `${auth.user.name} published the post “${post.title}”`,
    });
  }

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    publishedAt: updated.publishedAt?.toISOString() ?? null,
  });
}
