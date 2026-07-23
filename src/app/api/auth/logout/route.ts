/**
 * Sign out.
 *
 * The session row is DELETED, not just the cookie cleared. Clearing the cookie
 * alone would leave a token that still works if it was ever captured — logging
 * out has to invalidate the credential, not merely forget it locally.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, currentUser, destroySession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await currentUser();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) await destroySession(token);
  if (user) {
    await logActivity({
      userId: user.id,
      actorName: user.name,
      action: "user.signed_out",
      summary: `${user.name} signed out`,
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
