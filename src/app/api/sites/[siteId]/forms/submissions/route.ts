/**
 * A site's form submissions — the inbox behind the dashboard's Forms view.
 *
 * GET only: submissions are written by the public runtime endpoint
 * (/api/runtime/forms), never created here. They are Tier-2 live data, so nothing
 * on this path touches releases. Newest first, capped — the cap is not something
 * the caller can raise from the query string, for the same reason recentActivity's
 * is not.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSite } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const MAX = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  const submissions = await prisma.formSubmission.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" },
    take: MAX,
  });

  return NextResponse.json({
    submissions: submissions.map((s) => ({
      id: s.id,
      formKey: s.formKey,
      formName: s.formName,
      data: s.data,
      email: s.email,
      readAt: s.readAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
    unread: submissions.filter((s) => !s.readAt).length,
  });
}
