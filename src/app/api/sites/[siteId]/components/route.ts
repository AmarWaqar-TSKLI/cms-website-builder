/**
 * The site's shared components.
 *
 * GET  — every symbol plus its draft tree. The editor needs the trees, not just
 *        the names: the canvas expands instances locally so that dropping a
 *        header onto a page shows the header instantly, with no request.
 * POST — create one, optionally seeded with a subtree lifted off a page. That is
 *        the "Make component" path, and it is why `body` is accepted here rather
 *        than forcing a create-then-save round trip.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidBody } from "@/lib/drafts";
import { guardSite } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { stripExpansion } from "@/lib/shared-components";
import type { ComponentBody, PageBody } from "@/lib/registry/types";

export const dynamic = "force-dynamic";

const EMPTY: ComponentBody = { version: 1, root: [] };

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  const components = await prisma.component.findMany({
    where: { siteId, deletedAt: null },
    include: { draft: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    components: components.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      body: (c.draft?.body as unknown as ComponentBody) ?? EMPTY,
      lockVersion: c.draft?.lockVersion ?? 0,
      updatedAt: c.draft?.updatedAt ?? c.createdAt,
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  let payload: { name?: unknown; icon?: unknown; body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // The partial unique index enforces this too; checking first buys a readable
  // message instead of a constraint violation.
  const clash = await prisma.component.findFirst({
    where: { siteId, name, deletedAt: null },
    select: { id: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: "duplicate", message: `A component called “${name}” already exists.` },
      { status: 409 },
    );
  }

  // A subtree lifted off a page arrives already expanded if it contained nested
  // symbols, so strip the render-time provenance before it becomes stored data.
  const raw = payload.body;
  const body: ComponentBody = isValidBody(raw)
    ? { version: 1, root: stripExpansion((raw as PageBody).root) }
    : EMPTY;

  const created = await prisma.component.create({
    data: {
      siteId,
      name,
      icon: typeof payload.icon === "string" && payload.icon ? payload.icon : "◈",
      draft: { create: { body: body as never, updatedBy: userId, lockVersion: 1 } },
    },
    include: { draft: true },
  });

  await logActivity({
    siteId,
    userId,
    actorName: auth.user.name,
    action: "component.created",
    entityType: "component",
    entityId: created.id,
    summary: `${auth.user.name} created the shared component “${name}”`,
  });

  return NextResponse.json(
    {
      id: created.id,
      name: created.name,
      icon: created.icon,
      body,
      lockVersion: created.draft?.lockVersion ?? 1,
    },
    { status: 201 },
  );
}
