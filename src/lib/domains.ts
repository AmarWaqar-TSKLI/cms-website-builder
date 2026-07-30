/**
 * Custom domains — the "bring your own domain" plumbing.
 *
 * The part that actually SERVES a site by its domain already lives in
 * runtime/release.ts (`siteByHost`) and the middleware. This module is
 * everything around REGISTERING one, and it exists because a non-technical
 * person will paste "https://www.Golotto.com/" and mean `golotto.com`:
 *
 *   - normalise/validate what they typed into a real hostname,
 *   - decide what to tell them to point their DNS at (an A record or a CNAME),
 *   - and check whether they've actually pointed it yet.
 *
 * The "is it pointed yet?" check does a real DNS lookup, so this module is
 * server-only (it imports node:dns). The pure string helpers are also used by
 * the request path, so keep them free of side effects.
 */
import { promises as dns } from "node:dns";

/** apex vs www are the same site: registering one should serve the other. */
export function domainMatchCandidates(host: string): string[] {
  const bare = host
    .toLowerCase()
    .split(":")[0] // strip a port ("acme.test:3000" → "acme.test")
    .replace(/\.$/, ""); // strip a trailing dot (a fully-qualified name)
  const set = new Set<string>([bare]);
  if (bare.startsWith("www.")) set.add(bare.slice(4));
  else set.add(`www.${bare}`);
  return [...set];
}

export type NormalizeResult = { ok: true; domain: string } | { ok: false; error: string };

// One hostname label: 1–63 chars, letters/digits/hyphens, no leading/trailing hyphen.
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Turn whatever a person typed into a bare hostname, or explain why it can't be
 * one. Deliberately forgiving about the input (scheme, path, port, case,
 * whitespace, trailing dot) and strict about the result.
 */
export function normalizeDomain(raw: unknown): NormalizeResult {
  if (typeof raw !== "string") return { ok: false, error: "Enter a domain." };

  const domain = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "") // drop a pasted scheme
    .replace(/[/?#].*$/, "") // drop a path/query/fragment
    .replace(/:\d+$/, "") // drop a port
    .replace(/\.$/, ""); // drop a trailing dot

  if (!domain) return { ok: false, error: "Enter a domain." };
  if (domain.length > 253) return { ok: false, error: "That domain is too long." };

  if (domain === "localhost" || domain.endsWith(".localhost")) {
    return { ok: false, error: "localhost isn't a public domain." };
  }
  // A bare IP address is not a domain we can serve by name.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
    return { ok: false, error: "Enter a domain name, not an IP address." };
  }

  const labels = domain.split(".");
  if (labels.length < 2) {
    return { ok: false, error: "Enter a full domain, like golotto.com." };
  }
  for (const label of labels) {
    if (!LABEL.test(label)) {
      return { ok: false, error: `"${domain}" doesn't look like a valid domain.` };
    }
  }
  // The last label (the TLD) must be alphabetic — this also rejects things like
  // "site.123" and any address whose final part is a number.
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1])) {
    return { ok: false, error: `"${domain}" doesn't look like a valid domain.` };
  }

  return { ok: true, domain };
}

/* ── where to point the DNS ──────────────────────────────────────────────────
 * Configured once by the operator (see .env.example). A CNAME target is best —
 * it survives the server changing IP — but a raw A-record IP works too. Unset
 * (local dev), there is nothing to point at yet, and the panel says so.
 */
export type DomainTarget =
  | { kind: "cname"; value: string }
  | { kind: "a"; value: string }
  | { kind: "none"; value: null };

export function domainTarget(): DomainTarget {
  const cname = process.env.CUSTOM_DOMAIN_CNAME?.trim();
  if (cname) return { kind: "cname", value: cname };
  const ip = process.env.CUSTOM_DOMAIN_IP?.trim();
  if (ip) return { kind: "a", value: ip };
  return { kind: "none", value: null };
}

/* ── is it pointed at us yet? ─────────────────────────────────────────────── */

export type DomainStatus =
  | { status: "connected"; detail: string }
  | { status: "pending"; detail: string }
  | { status: "unconfigured"; detail: string };

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("dns-timeout")), ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * A best-effort DNS check. It answers one question — "does this name resolve to
 * where we told them to point it?" — and treats every failure as "not yet",
 * because a domain that was added a minute ago genuinely hasn't propagated. It
 * is a convenience for the dashboard, never a gate on anything.
 */
export async function checkDomainStatus(domain: string): Promise<DomainStatus> {
  const target = domainTarget();
  if (target.kind === "none") {
    return {
      status: "unconfigured",
      detail:
        "Your builder isn't on a public server yet, so there's nothing to point a domain at. Deploy it and this turns into a live check.",
    };
  }

  try {
    if (target.kind === "a") {
      const ips = await withTimeout(dns.resolve4(domain), 4000);
      if (ips.includes(target.value)) {
        return { status: "connected", detail: "Your domain points here. It's live." };
      }
      return {
        status: "pending",
        detail: `Your domain currently points somewhere else (${ips[0] ?? "nowhere"}). Add the A record below.`,
      };
    }

    // CNAME target: accept either a matching CNAME, or A records that resolve to
    // the same place the target does (some providers "flatten" a CNAME at the apex).
    const wanted = target.value.toLowerCase().replace(/\.$/, "");
    const cnames = await withTimeout(dns.resolveCname(domain), 4000).catch(() => [] as string[]);
    if (cnames.some((c) => c.toLowerCase().replace(/\.$/, "") === wanted)) {
      return { status: "connected", detail: "Your domain points here. It's live." };
    }
    const [domainIps, targetIps] = await Promise.all([
      withTimeout(dns.resolve4(domain), 4000).catch(() => [] as string[]),
      withTimeout(dns.resolve4(wanted), 4000).catch(() => [] as string[]),
    ]);
    if (domainIps.length && domainIps.some((ip) => targetIps.includes(ip))) {
      return { status: "connected", detail: "Your domain points here. It's live." };
    }
    return {
      status: "pending",
      detail: "We can't see your domain pointing here yet. DNS can take a few minutes to an hour.",
    };
  } catch {
    return {
      status: "pending",
      detail: "We can't see your domain pointing here yet. DNS can take a few minutes to an hour.",
    };
  }
}
