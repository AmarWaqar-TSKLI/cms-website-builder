/**
 * Redeem a reset link: set a new password, burn the token, sign out every
 * session everywhere. The last step matters — if the reset was prompted by a
 * stolen password, the thief's session must die with it.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { destroyAllSessions, hashPassword } from "@/lib/auth";
import { captureError } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let payload: { token?: unknown; password?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = typeof payload.token === "string" ? payload.token : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!token) return NextResponse.json({ error: "Missing reset token." }, { status: 400 });
  if (password.length < 8 || password.length > 200) {
    return NextResponse.json({ error: "Use a password of at least 8 characters." }, { status: 400 });
  }

  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one." },
      { status: 410 },
    );
  }

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await hashPassword(password) },
      }),
      prisma.passwordReset.update({
        where: { tokenHash: row.tokenHash },
        data: { usedAt: new Date() },
      }),
    ]);
    await destroyAllSessions(row.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    captureError(err, { scope: "auth.reset" });
    return NextResponse.json({ error: "Couldn't reset the password. Try again." }, { status: 500 });
  }
}
