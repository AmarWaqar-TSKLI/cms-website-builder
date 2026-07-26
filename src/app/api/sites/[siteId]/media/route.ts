/**
 * A site's images.
 *
 * GET  — every image the site owns, newest first, with its data URI so the
 *        library and the picker can show real thumbnails.
 * POST — upload one. The browser has already downscaled the picture to a data
 *        URI (keeping I13's "renders from file://" property); here we only check
 *        it really is an image within the size cap, then store it. No object
 *        storage, no image processing on the server.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSite } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { cleanLabel, validateImageDataUri } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  const media = await prisma.media.findMany({
    where: { siteId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    media: media.map((m) => ({
      id: m.id,
      url: m.storageKey,
      filename: m.filename,
      alt: m.alt,
      mime: m.mime,
      width: m.width,
      height: m.height,
      sizeBytes: m.sizeBytes,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  let payload: {
    dataUri?: unknown;
    filename?: unknown;
    alt?: unknown;
    width?: unknown;
    height?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const valid = validateImageDataUri(payload.dataUri);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const filename = cleanLabel(payload.filename);
  const alt = cleanLabel(payload.alt, 300);
  const width = Number.isFinite(Number(payload.width)) ? Math.round(Number(payload.width)) : null;
  const height = Number.isFinite(Number(payload.height)) ? Math.round(Number(payload.height)) : null;

  const created = await prisma.media.create({
    data: {
      siteId,
      storageKey: valid.value.dataUri,
      mime: valid.value.mime,
      sizeBytes: valid.value.sizeBytes,
      filename,
      alt,
      width,
      height,
    },
  });

  await logActivity({
    siteId,
    userId,
    actorName: auth.user.name,
    action: "media.uploaded",
    entityType: "media",
    entityId: created.id,
    summary: `${auth.user.name} uploaded an image${filename ? ` (${filename})` : ""}`,
  });

  return NextResponse.json(
    {
      id: created.id,
      url: created.storageKey,
      filename: created.filename,
      alt: created.alt,
      mime: created.mime,
      width: created.width,
      height: created.height,
      sizeBytes: created.sizeBytes,
    },
    { status: 201 },
  );
}
