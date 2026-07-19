/**
 * Theme editing.
 *
 * Saving a theme does NOT update a row — it appends a new theme_revision and
 * repoints theme.current_revision_id, exactly as publishing appends a page
 * revision. theme_revisions carries the same append-only trigger, so an old
 * design literally cannot be overwritten.
 *
 * The payoff is visible: change your brand colour, publish, then roll back, and
 * the old colour comes back with the old pages, because the release pinned that
 * theme revision in its manifest.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toJson } from "@/lib/json";
import { asLayout, asTokens } from "@/lib/theme";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const theme = await prisma.theme.findFirst({
    where: { siteId },
    include: { revisions: { orderBy: { versionNo: "desc" } } },
  });
  if (!theme) return NextResponse.json({ error: "No theme" }, { status: 404 });

  const current =
    theme.revisions.find((r) => r.id === theme.currentRevisionId) ?? theme.revisions[0];

  return NextResponse.json({
    themeId: theme.id,
    name: theme.name,
    currentRevisionId: current?.id ?? null,
    versionNo: current?.versionNo ?? 0,
    tokens: asTokens(current?.tokens),
    layout: asLayout(current?.layout),
    history: theme.revisions.map((r) => ({
      id: r.id,
      versionNo: r.versionNo,
      createdAt: r.createdAt,
      isCurrent: r.id === theme.currentRevisionId,
    })),
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const theme = await prisma.theme.findFirst({ where: { siteId } });
  if (!theme) return NextResponse.json({ error: "No theme" }, { status: 404 });

  const latest = await prisma.themeRevision.findFirst({
    where: { themeId: theme.id },
    orderBy: { versionNo: "desc" },
  });

  const tokens = asTokens({ ...(latest?.tokens as object), ...(payload.tokens ?? {}) });
  const layout = asLayout({ ...(latest?.layout as object), ...(payload.layout ?? {}) });

  // APPEND. The previous revision is untouched and still referenced by every
  // release that pinned it.
  const revision = await prisma.themeRevision.create({
    data: {
      themeId: theme.id,
      versionNo: (latest?.versionNo ?? 0) + 1,
      tokens: toJson(tokens),
      layout: toJson(layout),
    },
  });

  await prisma.theme.update({
    where: { id: theme.id },
    data: { currentRevisionId: revision.id },
  });

  return NextResponse.json({
    ok: true,
    revisionId: revision.id,
    versionNo: revision.versionNo,
    tokens,
    layout,
    note: "Appended theme_revisions v" + revision.versionNo + ". Publish to make it live.",
  });
}
