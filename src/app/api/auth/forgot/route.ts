/**
 * "Forgot password" — request a reset link.
 *
 * Always answers the same 200 whether the email exists or not: this endpoint
 * must not be an oracle for which addresses have accounts. The truthful signal
 * lives in the inbox. Rate-limited per address+IP so it can't be used to spam
 * someone either. Without the mail seam configured, resets simply can't be
 * delivered — the response says so honestly, because silently succeeding at
 * nothing would strand people.
 */
import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { mailConfigured, sendMail } from "@/lib/mail";
import { captureError } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_MINUTES = 60;

export async function POST(req: Request) {
  let payload: { email?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "Enter your email." }, { status: 400 });

  if (!mailConfigured()) {
    return NextResponse.json(
      { error: "Password reset isn't switched on — no mail provider is configured. Ask an administrator." },
      { status: 503 },
    );
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const rate = await checkRateLimit(`forgot:${email}:${ip}`, { windowMs: 15 * 60_000, max: 5 });
  if (rate.limited) {
    // Same body as success — a limiter that answers differently is an oracle too.
    return NextResponse.json({ ok: true });
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (user) {
    try {
      const token = randomBytes(32).toString("base64url");
      await prisma.passwordReset.create({
        data: {
          tokenHash: createHash("sha256").update(token).digest("hex"),
          userId: user.id,
          expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
        },
      });
      const origin = new URL(req.url).origin;
      await sendMail({
        to: email,
        subject: "Reset your password",
        text: `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset your password.\n\nReset it here: ${origin}/reset/${token}\n\nThe link works once and expires in ${RESET_MINUTES} minutes. If this wasn't you, ignore this email — nothing has changed.`,
      });
    } catch (err) {
      // Log, but the response stays identical — see the header comment.
      captureError(err, { scope: "auth.forgot" });
    }
  }

  return NextResponse.json({ ok: true });
}
