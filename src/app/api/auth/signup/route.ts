/**
 * Create an account.
 *
 * A real sign-up, the counterpart to sign-in: it makes a User, gives them their
 * own Organization, and builds a FRESH starter site (createStarterSite) — never
 * the seeded Acme demo. Then it opens a session, so the new person lands on their
 * dashboard already signed in, looking at a site that is genuinely theirs.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, createSession, hashPassword } from "@/lib/auth";
import { createStarterSite } from "@/lib/onboarding";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let payload: { name?: unknown; email?: unknown; password?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!name || name.length > 80) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8 || password.length > 200) {
    return NextResponse.json({ error: "Use a password of at least 8 characters." }, { status: 400 });
  }

  // A light brake on abuse of an unauthenticated, account-creating endpoint.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rate = await checkRateLimit(`signup:${ip}`, { windowMs: 60_000, max: 6 });
  if (rate.limited) {
    return NextResponse.json({ error: "Too many sign-ups from here. Wait a minute." }, { status: 429 });
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists — try signing in." },
      { status: 409 },
    );
  }

  let user;
  try {
    user = await prisma.user.create({
      data: { email, name: name.slice(0, 80), passwordHash: await hashPassword(password) },
    });
  } catch {
    // Unique-email race between the check above and here.
    return NextResponse.json(
      { error: "An account with that email already exists — try signing in." },
      { status: 409 },
    );
  }

  const org = await prisma.organization.create({ data: { name: `${name}'s workspace` } });
  await prisma.membership.create({ data: { orgId: org.id, userId: user.id, role: "owner" } });
  await createStarterSite(org.id, `${name}'s site`, user.id);

  const token = await createSession(user.id, req.headers.get("user-agent"));
  const res = NextResponse.json({ ok: true, user: { id: user.id, email, name } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
  return res;
}
