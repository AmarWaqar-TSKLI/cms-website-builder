/**
 * Manage a site's publish webhooks.
 *
 *   GET    — list (members may look; the signing secret is shown, it only signs
 *            OUTBOUND payloads and grants no access to us).
 *   POST   — add an endpoint. OWNER ONLY. The secret is generated server-side.
 *   DELETE — remove one by id. OWNER ONLY.
 *
 * Deliveries fire on every live-release change — publish AND rollback — signed
 * with `X-CMS-Signature: sha256=<hmac-sha256(secret, body)>`.
 */
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSite, guardSiteOwner } from "@/lib/api-auth";
import { captureError } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  const webhooks = await prisma.webhook.findMany({
    where: { siteId, disabledAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, secret: true, createdAt: true },
  });
  return NextResponse.json({ webhooks });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSiteOwner(siteId);
  if (!auth.ok) return auth.response;

  let payload: { url?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const raw = typeof payload.url === "string" ? payload.url.trim() : "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Enter a full URL, like https://…" }, { status: 400 });
  }
  // https only (http allowed for localhost so local consumers can be tested).
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    return NextResponse.json({ error: "Webhook URLs must be https." }, { status: 400 });
  }

  const count = await prisma.webhook.count({ where: { siteId, disabledAt: null } });
  if (count >= 10) {
    return NextResponse.json({ error: "Too many webhooks — remove one first." }, { status: 409 });
  }

  try {
    const created = await prisma.webhook.create({
      data: {
        siteId,
        url: url.toString().slice(0, 500),
        secret: `whs_${randomBytes(24).toString("hex")}`,
        createdBy: auth.user.id,
      },
      select: { id: true, url: true, secret: true, createdAt: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    captureError(err, { scope: "webhooks.create", siteId });
    return NextResponse.json({ error: "Couldn't add the webhook." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSiteOwner(siteId);
  if (!auth.ok) return auth.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing webhook id." }, { status: 400 });

  const result = await prisma.webhook.updateMany({
    where: { id, siteId, disabledAt: null },
    data: { disabledAt: new Date() },
  });
  if (result.count === 0) return NextResponse.json({ error: "Webhook not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
