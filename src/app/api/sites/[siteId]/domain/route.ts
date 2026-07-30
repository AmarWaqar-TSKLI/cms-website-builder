/**
 * A site's custom domain — connect one, check it, disconnect it.
 *
 * Setting the domain is a single column write (`sites.custom_domain`); the whole
 * point of the architecture is that this is all it takes to make golotto.com
 * serve a site, because the request path already matches the Host header against
 * that column (release.ts → siteByHost). Everything here is the human layer on
 * top: validate what they typed, keep one domain to one site, and tell them
 * whether their DNS has caught up.
 *
 * `custom_domain` is UNIQUE in the schema, so "already taken" is a database
 * guarantee, not a check we can race — we just translate the constraint error
 * into a friendly 409.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { guardSite } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { captureError } from "@/lib/monitor";
import { checkDomainStatus, domainTarget, normalizeDomain } from "@/lib/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current domain, where to point it, and whether it's live yet. */
export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { customDomain: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const status = site.customDomain
    ? await checkDomainStatus(site.customDomain)
    : { status: "none" as const, detail: "" };

  return NextResponse.json({ domain: site.customDomain, target: domainTarget(), ...status });
}

/** Connect (or replace) the domain for this site. */
export async function PUT(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  let payload: { domain?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const norm = normalizeDomain(payload.domain);
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 });

  try {
    await prisma.site.update({ where: { id: siteId }, data: { customDomain: norm.domain } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: `${norm.domain} is already connected to another site.` },
        { status: 409 },
      );
    }
    captureError(err, { scope: "domain.set", siteId });
    return NextResponse.json({ error: "Couldn't save the domain." }, { status: 500 });
  }

  await logActivity({
    siteId,
    userId: auth.user.id,
    actorName: auth.user.name,
    action: "site.domain_set",
    entityType: "site",
    entityId: siteId,
    summary: `${auth.user.name} connected the domain ${norm.domain}`,
  });

  const status = await checkDomainStatus(norm.domain);
  return NextResponse.json({ domain: norm.domain, target: domainTarget(), ...status });
}

/** Disconnect the domain — the site keeps serving at /s/<slug> as before. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const auth = await guardSite(siteId);
  if (!auth.ok) return auth.response;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { customDomain: true },
  });
  await prisma.site.update({ where: { id: siteId }, data: { customDomain: null } });

  if (site?.customDomain) {
    await logActivity({
      siteId,
      userId: auth.user.id,
      actorName: auth.user.name,
      action: "site.domain_removed",
      entityType: "site",
      entityId: siteId,
      summary: `${auth.user.name} disconnected the domain ${site.customDomain}`,
    });
  }

  return NextResponse.json({ domain: null, target: domainTarget() });
}
