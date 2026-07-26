/**
 * One image: rename/alt (PATCH) or remove (DELETE).
 *
 * Delete is SOFT and deliberately safe. Published sites never read this table —
 * every release froze the image's data URI into release_data at build time — so
 * removing an image here only affects DRAFTS and the next publish. A live site,
 * and any older version you might roll back to, is untouched.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardMedia } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { cleanLabel } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const auth = await guardMedia(mediaId);
  if (!auth.ok) return auth.response;

  let payload: { filename?: unknown; alt?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { filename?: string | null; alt?: string | null } = {};
  if ("filename" in payload) data.filename = cleanLabel(payload.filename);
  if ("alt" in payload) data.alt = cleanLabel(payload.alt, 300);

  const updated = await prisma.media.update({ where: { id: mediaId }, data });
  return NextResponse.json({ id: updated.id, filename: updated.filename, alt: updated.alt });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const auth = await guardMedia(mediaId);
  if (!auth.ok) return auth.response;

  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { id: true, deletedAt: true, filename: true },
  });
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!media.deletedAt) {
    await prisma.media.update({ where: { id: mediaId }, data: { deletedAt: new Date() } });
    await logActivity({
      siteId: auth.extra.siteId,
      userId: auth.user.id,
      actorName: auth.user.name,
      action: "media.deleted",
      entityType: "media",
      entityId: mediaId,
      summary: `${auth.user.name} removed an image${media.filename ? ` (${media.filename})` : ""}`,
    });
  }

  return NextResponse.json({ ok: true });
}
