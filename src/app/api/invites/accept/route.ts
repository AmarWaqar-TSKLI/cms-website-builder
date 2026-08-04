/**
 * Redeem an invite for the signed-in user. The heavy checks (expiry, single
 * use, the email binding) live in lib/invites.ts.
 */
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { acceptInvite } from "@/lib/invites";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let payload: { token?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = typeof payload.token === "string" ? payload.token : "";
  if (!token) return NextResponse.json({ error: "Missing invite token." }, { status: 400 });

  const result = await acceptInvite(token, user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await logActivity({
    userId: user.id,
    actorName: user.name,
    action: "team.joined",
    summary: `${user.name} joined ${result.orgName}`,
  });
  return NextResponse.json({ ok: true, orgName: result.orgName });
}
