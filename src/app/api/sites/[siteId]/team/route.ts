/**
 * The team behind a site's organisation.
 *
 *   GET    — members + pending invites (owner or editor may look).
 *   POST   — invite someone by email. OWNER ONLY. Returns the invite LINK once —
 *            the token inside it is never recoverable after this response.
 *   DELETE — revoke a pending invite by id. OWNER ONLY.
 *
 * If the mail seam is configured (lib/mail.ts) the invite is also emailed;
 * either way the link comes back to the inviter, so a missing mail provider
 * never blocks getting a teammate in — copy the link into any channel.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSite, guardSiteOwner } from "@/lib/api-auth";
import { createInvite } from "@/lib/invites";
import { logActivity } from "@/lib/activity";
import { captureError } from "@/lib/monitor";
import { sendMail, mailConfigured } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function orgOf(siteId: string): Promise<{ orgId: string; orgName: string } | null> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { orgId: true, org: { select: { name: true } } },
  });
  return site ? { orgId: site.orgId, orgName: site.org.name } : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;
  const org = await orgOf(siteId);
  if (!org) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const [members, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { orgId: org.orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.invite.findMany({
      where: { orgId: org.orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    members: members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      you: m.user.id === auth.user.id,
    })),
    invites,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSiteOwner(siteId);
  if (!auth.ok) return auth.response;
  const org = await orgOf(siteId);
  if (!org) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  let payload: { email?: unknown; role?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  const role = payload.role === "owner" ? "owner" : "editor";

  const existing = await prisma.membership.findFirst({
    where: { orgId: org.orgId, user: { email } },
  });
  if (existing) {
    return NextResponse.json({ error: "That person is already on the team." }, { status: 409 });
  }

  try {
    const invite = await createInvite(org.orgId, email, role, auth.user.id);
    const origin = new URL(req.url).origin;
    const url = `${origin}/invite/${invite.token}`;

    // Best-effort email; the link in the response is the guaranteed path.
    if (mailConfigured()) {
      void sendMail({
        to: email,
        subject: `${auth.user.name} invited you to ${org.orgName}`,
        text: `${auth.user.name} invited you to join "${org.orgName}" as ${role}.\n\nAccept: ${url}\n\nThis link expires in 7 days and only works for ${email}.`,
      }).catch((err) => captureError(err, { scope: "team.invite-mail", siteId }));
    }

    await logActivity({
      siteId,
      userId: auth.user.id,
      actorName: auth.user.name,
      action: "team.invited",
      entityType: "site",
      entityId: siteId,
      summary: `${auth.user.name} invited ${email} as ${role}`,
    });

    return NextResponse.json(
      { id: invite.id, email, role, url, expiresAt: invite.expiresAt, emailed: mailConfigured() },
      { status: 201 },
    );
  } catch (err) {
    captureError(err, { scope: "team.invite", siteId });
    return NextResponse.json({ error: "Couldn't create the invite." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSiteOwner(siteId);
  if (!auth.ok) return auth.response;
  const org = await orgOf(siteId);
  if (!org) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing invite id." }, { status: 400 });

  // Scoped to THIS org so an id from elsewhere can't be touched.
  const result = await prisma.invite.deleteMany({
    where: { id, orgId: org.orgId, acceptedAt: null },
  });
  if (result.count === 0) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
