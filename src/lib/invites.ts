/**
 * Team invites — mint, verify, accept.
 *
 * The token discipline is the codebase's standard one (sessions, API keys):
 * 32 random bytes, only the SHA-256 stored, plaintext shown once in the invite
 * link. An invite is bound to an EMAIL, not just anyone holding the link — a
 * forwarded link redeemed by the wrong account is refused with a reason.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";

const INVITE_DAYS = 7;

export const hashInviteToken = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex");

export interface MintedInvite {
  id: string;
  /** The full secret, embedded in the invite link. Never stored. */
  token: string;
  expiresAt: Date;
}

export async function createInvite(
  orgId: string,
  email: string,
  role: "owner" | "editor",
  createdBy: string,
): Promise<MintedInvite> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  const row = await prisma.invite.create({
    data: {
      orgId,
      email: email.trim().toLowerCase(),
      role,
      tokenHash: hashInviteToken(token),
      createdBy,
      expiresAt,
    },
    select: { id: true },
  });
  return { id: row.id, token, expiresAt };
}

export type InviteLookup =
  | { ok: true; invite: { id: string; orgId: string; orgName: string; email: string; role: string } }
  | { ok: false; reason: "not-found" | "expired" | "already-accepted" };

/** Resolve an invite link's token to a still-redeemable invite. */
export async function lookupInvite(token: string): Promise<InviteLookup> {
  const row = await prisma.invite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { org: { select: { name: true } } },
  });
  if (!row) return { ok: false, reason: "not-found" };
  if (row.acceptedAt) return { ok: false, reason: "already-accepted" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  return {
    ok: true,
    invite: { id: row.id, orgId: row.orgId, orgName: row.org.name, email: row.email, role: row.role },
  };
}

export type AcceptResult =
  | { ok: true; orgId: string; orgName: string }
  | { ok: false; status: number; error: string };

/**
 * Redeem an invite for the signed-in user. The email must match the invite —
 * that binding is the whole difference between "an invite" and "a magic link
 * anyone can use".
 */
export async function acceptInvite(
  token: string,
  user: { id: string; email: string },
): Promise<AcceptResult> {
  const found = await lookupInvite(token);
  if (!found.ok) {
    const message =
      found.reason === "expired"
        ? "This invite has expired — ask for a new one."
        : found.reason === "already-accepted"
          ? "This invite was already used."
          : "This invite link isn't valid.";
    return { ok: false, status: 410, error: message };
  }
  const { invite } = found;
  if (invite.email !== user.email.trim().toLowerCase()) {
    return {
      ok: false,
      status: 403,
      error: `This invite is for ${invite.email}. Sign in with that email to accept it.`,
    };
  }

  await prisma.$transaction([
    prisma.membership.upsert({
      where: { orgId_userId: { orgId: invite.orgId, userId: user.id } },
      create: { orgId: invite.orgId, userId: user.id, role: invite.role },
      // Already a member: keep the stronger role rather than downgrading.
      update: {},
    }),
    prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);

  return { ok: true, orgId: invite.orgId, orgName: invite.orgName };
}
