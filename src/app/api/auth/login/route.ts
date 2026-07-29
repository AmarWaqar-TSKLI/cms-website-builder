/**
 * Sign in.
 *
 * The security-relevant choices, all of which are deliberate:
 *
 *   ONE ERROR MESSAGE. A wrong email and a wrong password produce the identical
 *   response. Distinguishing them turns this endpoint into a way to discover who
 *   has an account.
 *
 *   CONSTANT-ISH WORK. When the email is unknown we still run a scrypt
 *   verification against a dummy hash, so "no such user" does not return
 *   measurably faster than "wrong password".
 *
 *   RATE LIMITED per email+IP. Not a substitute for a real limiter in front of
 *   the app, but it turns an online brute force from thousands of attempts a
 *   second into a handful a minute.
 *
 *   HTTP-ONLY COOKIE. JavaScript cannot read the session token, so an XSS bug
 *   elsewhere cannot exfiltrate it. `sameSite: lax` means another origin cannot
 *   drive state-changing requests with the user's cookie.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** A real hash to compare against when the email is unknown. Cost, not secrecy. */
let dummyHash: string | null = null;
async function burnTime(password: string) {
  dummyHash ??= await hashPassword("this-account-does-not-exist");
  await verifyPassword(password, dummyHash);
}

// ── Rate limiting ────────────────────────────────────────────────────────────
// The limiter now lives in lib/rate-limit.ts: still in-process by default, but a
// shared cross-instance backend when RATE_LIMIT_REST_* is set — which is what a
// real multi-server deploy wants. Either way, one attacker on one connection
// cannot grind through a password list.
const ATTEMPT_WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

function clientKey(req: Request, email: string): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `login:${email}|${forwarded || "local"}`;
}

export async function POST(req: Request) {
  let payload: { email?: unknown; password?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  // Bounded before anything expensive happens: scrypt on a 10MB string is a
  // denial-of-service primitive, not a login.
  if (!email || !password || email.length > 254 || password.length > 200) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const rate = await checkRateLimit(clientKey(req, email), {
    windowMs: ATTEMPT_WINDOW_MS,
    max: MAX_ATTEMPTS,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await burnTime(password);
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createSession(user.id, req.headers.get("user-agent"));

  await logActivity({
    userId: user.id,
    actorName: user.name,
    action: "user.signed_in",
    summary: `${user.name} signed in`,
  });

  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Off over plain HTTP or the cookie would never be stored on localhost.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
  return res;
}
