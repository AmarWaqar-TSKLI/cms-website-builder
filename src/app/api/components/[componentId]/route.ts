/**
 * One shared component: rename, inspect usage, or delete.
 *
 * The usage lookup is the interesting part, and it answers the question in two
 * tenses, because they have genuinely different answers:
 *
 *   "which pages will change if I edit this?"  — scans page drafts, right now.
 *   "which live releases already use this?"    — reads release_dependencies,
 *                                                the reverse index built at
 *                                                publish time.
 *
 * DELETE is soft and is deliberately NOT blocked by live usage. A release pinned
 * an immutable revision, so deleting the symbol cannot alter what that release
 * renders — the guarantee a deleted *product* does not come with. What deletion
 * does affect is pages still referencing it in their drafts, so those are
 * reported, and removing one that is in use needs `?force=1`.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { releasesReferencing } from "@/lib/dependencies";
import { usageOf } from "@/lib/component-usage";
import { guardComponent } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { displayNameOf } from "@/lib/shared-components";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ componentId: string }> },
) {
  const { componentId } = await params;
  const auth = await guardComponent(componentId);
  if (!auth.ok) return auth.response;

  const component = await prisma.component.findFirst({
    where: { id: componentId, deletedAt: null },
    include: { draft: true, revisions: { orderBy: { versionNo: "desc" }, take: 20 } },
  });
  if (!component) return NextResponse.json({ error: "Component not found" }, { status: 404 });

  const [usage, releases] = await Promise.all([
    usageOf(component.siteId, componentId),
    releasesReferencing("component", componentId),
  ]);

  return NextResponse.json({
    id: component.id,
    siteId: component.siteId,
    name: component.name,
    icon: component.icon,
    body: component.draft?.body ?? { version: 1, root: [] },
    lockVersion: component.draft?.lockVersion ?? 0,
    revisions: component.revisions.map((r) => ({
      id: r.id,
      versionNo: r.versionNo,
      createdAt: r.createdAt,
    })),
    usedBy: usage,
    liveReleases: releases.filter((r) => r.isLive),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ componentId: string }> },
) {
  const { componentId } = await params;
  const auth = await guardComponent(componentId);
  if (!auth.ok) return auth.response;

  let payload: { name?: unknown; icon?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const component = await prisma.component.findFirst({
    where: { id: componentId, deletedAt: null },
  });
  if (!component) return NextResponse.json({ error: "Component not found" }, { status: 404 });

  const name = typeof payload.name === "string" ? payload.name.trim() : component.name;
  if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });

  if (name !== component.name) {
    const clash = await prisma.component.findFirst({
      where: { siteId: component.siteId, name, deletedAt: null },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: "duplicate", message: `A component called “${name}” already exists.` },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.component.update({
    where: { id: componentId },
    data: {
      name,
      icon: typeof payload.icon === "string" && payload.icon ? payload.icon : component.icon,
    },
  });

  await logActivity({
    siteId: component.siteId,
    userId: auth.user.id,
    actorName: auth.user.name,
    action: "component.renamed",
    entityType: "component",
    entityId: componentId,
    summary: `${auth.user.name} renamed a component to “${name}”`,
  });

  return NextResponse.json({ id: updated.id, name: updated.name, icon: updated.icon });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ componentId: string }> },
) {
  const { componentId } = await params;
  const auth = await guardComponent(componentId);
  if (!auth.ok) return auth.response;
  const force = new URL(req.url).searchParams.get("force") === "1";

  const component = await prisma.component.findFirst({
    where: { id: componentId, deletedAt: null },
  });
  if (!component) return NextResponse.json({ error: "Component not found" }, { status: 404 });

  const usage = await usageOf(component.siteId, componentId);
  const { pages, components } = usage;

  if (!force && (pages.length || components.length)) {
    return NextResponse.json(
      {
        error: "in_use",
        message: `“${component.name}” is still used by ${pages.length} page(s) and ${components.length} component(s).`,
        usedBy: usage,
      },
      { status: 409 },
    );
  }

  // Soft delete. Revisions stay exactly where they are — they are append-only,
  // and every release that pinned one keeps rendering it.
  await prisma.component.update({
    where: { id: componentId },
    data: { deletedAt: new Date() },
  });

  await logActivity({
    siteId: component.siteId,
    userId: auth.user.id,
    actorName: auth.user.name,
    action: "component.deleted",
    entityType: "component",
    entityId: componentId,
    summary: `${auth.user.name} deleted the component “${displayNameOf(component)}”`,
  });

  return NextResponse.json({ ok: true, deletedPages: pages.length });
}
