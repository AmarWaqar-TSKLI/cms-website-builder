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
import {
  deleteRailwayDomain,
  railwayConfigured,
  registerRailwayDomain,
  railwayDomainStatus,
} from "@/lib/railway";
import {
  createManagedZone,
  deleteManagedZone,
  managedDnsConfigured,
  managedNameservers,
} from "@/lib/dnszone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Build the response for a domain. When the Railway integration is wired up it
 * is the authority — it hands back the exact DNS record to add and whether the
 * domain is live — so the owner registers a domain entirely from this app and
 * never touches the host. Without it, we fall back to a plain DNS-resolution
 * check against the configured target.
 */
async function domainResponse(siteId: string, domain: string | null, register: boolean) {
  if (!domain) {
    return {
      domain: null,
      target: domainTarget(),
      status: "none" as const,
      detail: "",
      railway: null,
      managed: managedDnsConfigured() ? { active: true, nameservers: managedNameservers() } : null,
    };
  }

  // The best path when it's configured: we run the customer's DNS ourselves.
  // They point their nameservers at ours ONCE and we manage every record for
  // them (apex, www, wildcard → the TLS front door), and the certificate is
  // issued automatically on first request. This is the Vercel/Netlify model —
  // no per-record copy-paste, and it survives the server ever changing IP.
  if (managedDnsConfigured()) {
    let nameservers = managedNameservers();
    if (register) {
      try {
        const ns = await createManagedZone(domain);
        if (ns) nameservers = ns;
      } catch (err) {
        // A DNS-API hiccup must not fail the request — the domain is saved
        // either way; the customer can still point their nameservers, and a
        // re-check re-creates the zone (createManagedZone is idempotent).
        captureError(err, { scope: "domain.managed", siteId });
      }
    }
    // The same DNS resolution check works for this path too: once delegation
    // propagates, the domain resolves (via our zone) to the TLS front door.
    const status = await checkDomainStatus(domain);
    return { domain, target: domainTarget(), ...status, railway: null, managed: { active: true, nameservers } };
  }

  if (railwayConfigured()) {
    try {
      const info = register ? await registerRailwayDomain(domain) : await railwayDomainStatus(domain);
      if (info) {
        return {
          domain,
          target: domainTarget(),
          status: info.connected ? ("connected" as const) : ("pending" as const),
          detail: info.connected
            ? "Your domain points here and its certificate is issued — it's live."
            : "Add the DNS record below at your domain provider. It usually goes live within an hour.",
          railway: info,
          managed: null,
        };
      }
    } catch (err) {
      // A hosting-API hiccup must not fail the whole request — the domain is
      // saved either way; fall back to the DNS check.
      captureError(err, { scope: "domain.railway", siteId });
    }
  }
  const status = await checkDomainStatus(domain);
  return { domain, target: domainTarget(), ...status, railway: null, managed: null };
}

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

  return NextResponse.json(await domainResponse(siteId, site.customDomain, false));
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

  return NextResponse.json(await domainResponse(siteId, norm.domain, true));
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
    // Also unregister it from the host, so disconnecting here fully undoes the
    // connect (best-effort — a leftover won't fail the disconnect).
    await deleteRailwayDomain(site.customDomain);
    await deleteManagedZone(site.customDomain);
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
