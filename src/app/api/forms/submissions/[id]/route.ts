/**
 * One form submission: mark it read, or delete it.
 *
 * PATCH { read: true|false } — a "have I seen this" flag, not a workflow.
 * DELETE — remove it for good. Unlike a product or a page, a submission has no
 *   frozen release depending on it (it is pure Tier-2 with nothing pointing back),
 *   so there is nothing to degrade and a hard delete is honest. It is the owner's
 *   own data — clearing spam should not leave a soft-deleted ghost behind.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardFormSubmission } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await guardFormSubmission(id);
  if (!auth.ok) return auth.response;

  let payload: { read?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const read = Boolean(payload.read);
  await prisma.formSubmission.update({
    where: { id },
    data: { readAt: read ? new Date() : null },
  });

  return NextResponse.json({ ok: true, readAt: read ? new Date().toISOString() : null });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await guardFormSubmission(id);
  if (!auth.ok) return auth.response;

  const submission = await prisma.formSubmission.findUnique({
    where: { id },
    select: { formName: true, formKey: true },
  });

  await prisma.formSubmission.delete({ where: { id } });

  await logActivity({
    siteId: auth.extra.siteId,
    userId: auth.user.id,
    actorName: auth.user.name,
    action: "form.deleted",
    entityType: "form",
    entityId: id,
    summary: `${auth.user.name} deleted a “${submission?.formName || submission?.formKey || "form"}” submission`,
  });

  return NextResponse.json({ ok: true });
}
