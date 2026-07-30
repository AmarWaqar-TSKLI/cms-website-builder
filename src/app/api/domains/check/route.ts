/**
 * The on-demand TLS gate for the reverse proxy (Caddy's `ask`).
 *
 * Before the proxy fetches an HTTPS certificate for an incoming host, it asks
 * here. We answer 200 only for a domain some site has actually connected —
 * otherwise anyone who points a hostname at our IP could make us request
 * unlimited certificates from Let's Encrypt and get rate-limited (or worse).
 *
 * Deliberately public and dependency-free: it reveals only whether a domain is
 * already a live site, which a visitor could tell by loading it anyway. It does
 * NOT require a session — the caller is our own proxy, not a person.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { domainMatchCandidates } from "@/lib/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get("domain")?.trim();
  if (!domain) return new NextResponse("no domain", { status: 400 });

  const site = await prisma.site.findFirst({
    where: { customDomain: { in: domainMatchCandidates(domain) } },
    select: { id: true },
  });

  // Plain text, not JSON — Caddy only looks at the status code.
  return site ? new NextResponse("ok", { status: 200 }) : new NextResponse("unknown", { status: 404 });
}
