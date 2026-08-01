/**
 * Managed DNS — the "we host your domain" path (the Vercel-nameservers model).
 *
 * When a customer connects a domain the nameserver way, we create a zone for it
 * on our OWN authoritative DNS server (PowerDNS on the TLS VM, driven over its
 * HTTPS REST API) with apex + www + wildcard all pointing at the TLS front door.
 * The customer points their domain's nameservers at ours ONCE, and from then on
 * every record is ours to create and manage — no more per-record copy-paste, and
 * the on-demand-TLS layer mints the certificate automatically.
 *
 * Env-gated (PDNS_API_URL + PDNS_API_KEY + PDNS_NAMESERVERS + CUSTOM_DOMAIN_IP).
 * Without them the app simply falls back to the manual A-record flow (domains.ts),
 * so this whole capability is a drop-in — nothing else has to know it exists.
 */
const API = process.env.PDNS_API_URL?.trim(); // …/api/v1/servers/localhost
const KEY = process.env.PDNS_API_KEY?.trim();
const NAMESERVERS = (process.env.PDNS_NAMESERVERS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TARGET_IP = process.env.CUSTOM_DOMAIN_IP?.trim();

export function managedDnsConfigured(): boolean {
  return !!(API && KEY && NAMESERVERS.length && TARGET_IP);
}

/** The nameservers a customer points their domain at (bare hostnames). */
export function managedNameservers(): string[] {
  return NAMESERVERS;
}

const fqdn = (name: string) => (name.endsWith(".") ? name : `${name}.`);

async function pdns(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(`${API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "X-API-Key": KEY as string, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create — or refresh — a zone for `domain`, pointing apex, www and everything
 * under it at the TLS front door. Idempotent: an existing zone is PATCHed rather
 * than failing, so re-connecting the same domain is safe. Returns the
 * nameservers to hand the customer, or null when managed DNS isn't configured.
 */
export async function createManagedZone(domain: string): Promise<string[] | null> {
  if (!managedDnsConfigured()) return null;
  const zone = fqdn(domain);
  const rrsets = [
    { name: zone, type: "A", ttl: 300, changetype: "REPLACE", records: [{ content: TARGET_IP, disabled: false }] },
    { name: `www.${zone}`, type: "A", ttl: 300, changetype: "REPLACE", records: [{ content: TARGET_IP, disabled: false }] },
    { name: `*.${zone}`, type: "A", ttl: 300, changetype: "REPLACE", records: [{ content: TARGET_IP, disabled: false }] },
  ];

  const created = await pdns(`/zones`, {
    method: "POST",
    body: JSON.stringify({ name: zone, kind: "Native", nameservers: NAMESERVERS.map(fqdn), rrsets }),
  });
  if (created.status === 409) {
    const patched = await pdns(`/zones/${zone}`, { method: "PATCH", body: JSON.stringify({ rrsets }) });
    if (!patched.ok) throw new Error(`PowerDNS PATCH returned ${patched.status}`);
  } else if (!created.ok) {
    throw new Error(`PowerDNS POST returned ${created.status}`);
  }
  return NAMESERVERS;
}

/** Remove a managed zone (best-effort — a leftover must never fail a disconnect). */
export async function deleteManagedZone(domain: string): Promise<void> {
  if (!managedDnsConfigured()) return;
  try {
    await pdns(`/zones/${fqdn(domain)}`, { method: "DELETE" });
  } catch {
    /* best-effort */
  }
}

/** True once a zone for this domain exists on our server. */
export async function managedZoneExists(domain: string): Promise<boolean> {
  if (!managedDnsConfigured()) return false;
  try {
    const res = await pdns(`/zones/${fqdn(domain)}`);
    return res.ok;
  } catch {
    return false;
  }
}
