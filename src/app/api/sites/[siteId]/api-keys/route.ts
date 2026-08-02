/**
 * Manage a site's Content-API keys from the dashboard.
 *
 *   GET    — list this site's keys (prefix + metadata only; the secret is gone).
 *   POST   — mint a new key. The plaintext is returned ONCE, here, and never again.
 *   DELETE — revoke a key by id (soft flag, so the audit trail survives).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSite } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { captureError } from "@/lib/monitor";
import { mintKey } from "@/lib/apikeys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function listKeys(siteId: string) {
  return prisma.apiKey.findMany({
    where: { siteId, revokedAt: null },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ keys: await listKeys(siteId) });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  let name = "API key";
  try {
    const body = (await req.json()) as { name?: unknown };
    if (typeof body.name === "string" && body.name.trim()) name = body.name.trim().slice(0, 60);
  } catch {
    /* no body is fine — the name is optional */
  }

  // A modest cap so a runaway script can't mint keys without bound.
  const active = await prisma.apiKey.count({ where: { siteId, revokedAt: null } });
  if (active >= 20) {
    return NextResponse.json({ error: "Too many active keys — revoke one first." }, { status: 409 });
  }

  const key = mintKey();
  try {
    const row = await prisma.apiKey.create({
      data: { siteId, name, keyHash: key.hash, prefix: key.prefix, createdBy: auth.user.id },
      select: { id: true, name: true, prefix: true, createdAt: true },
    });
    await logActivity({
      siteId,
      userId: auth.user.id,
      actorName: auth.user.name,
      action: "site.api_key_created",
      entityType: "site",
      entityId: siteId,
      summary: `${auth.user.name} created a Content-API key (${key.prefix})`,
    });
    // `token` is the ONLY time the plaintext leaves the server.
    return NextResponse.json({ ...row, token: key.token }, { status: 201 });
  } catch (err) {
    captureError(err, { scope: "api-keys.create", siteId });
    return NextResponse.json({ error: "Couldn't create the key." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing key id." }, { status: 400 });

  // Scope the revoke to THIS site, so an id from another site can't be touched.
  const result = await prisma.apiKey.updateMany({
    where: { id, siteId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) return NextResponse.json({ error: "Key not found." }, { status: 404 });

  await logActivity({
    siteId,
    userId: auth.user.id,
    actorName: auth.user.name,
    action: "site.api_key_revoked",
    entityType: "site",
    entityId: siteId,
    summary: `${auth.user.name} revoked a Content-API key`,
  });
  return NextResponse.json({ keys: await listKeys(siteId) });
}
