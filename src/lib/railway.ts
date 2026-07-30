/**
 * Railway integration — register a customer's custom domain on the hosting
 * platform, so a site owner adds their domain ONLY in this app and never has to
 * touch Railway. Railway is the front door that terminates TLS, so it has to
 * know the domain exists; this hides that entirely (the Shopify/Webflow model).
 *
 * Fully optional and env-gated. With RAILWAY_API_TOKEN + the project/environment
 * /service ids set, connecting a domain here also registers it with Railway and
 * reads back the exact DNS record to show the owner, plus live cert/DNS status.
 * Without them, every function no-ops and the app just records the domain in its
 * own table (domains.ts). That keeps the app portable: a different host — or a
 * self-run Caddy proxy with on-demand TLS — is a drop-in replacement for this
 * one file, and nothing else changes.
 */
const RAILWAY_API = "https://backboard.railway.com/graphql/v2";

interface Cfg {
  token: string;
  projectId: string;
  environmentId: string;
  serviceId: string;
}

function cfg(): Cfg | null {
  const token = process.env.RAILWAY_API_TOKEN?.trim();
  const projectId = process.env.RAILWAY_PROJECT_ID?.trim();
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID?.trim();
  const serviceId = process.env.RAILWAY_SERVICE_ID?.trim();
  if (!token || !projectId || !environmentId || !serviceId) return null;
  return { token, projectId, environmentId, serviceId };
}

export function railwayConfigured(): boolean {
  return cfg() !== null;
}

/** A DNS record the owner must create at their registrar, in plain terms. */
export interface RailwayDnsRecord {
  type: string; // CNAME, A, …
  name: string; // the host to create the record for
  value: string; // what to point it at
  ok: boolean; // whether it already resolves correctly
}

export interface RailwayDomainInfo {
  dnsRecords: RailwayDnsRecord[];
  certificateStatus: string | null;
  /** DNS points here AND the certificate is issued — safe to call it live. */
  connected: boolean;
}

/* ── GraphQL plumbing ─────────────────────────────────────────────────────── */

async function call<T>(c: Cfg, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(RAILWAY_API, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${c.token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error("Empty response from Railway");
  return json.data;
}

const DOMAIN_FIELDS = `
  domain
  status {
    certificateStatus
    dnsRecords { recordType fqdn hostlabel requiredValue currentValue status }
  }
`;

interface RawDns {
  recordType?: string | null;
  fqdn?: string | null;
  hostlabel?: string | null;
  requiredValue?: string | null;
  currentValue?: string | null;
  status?: string | null;
}
interface RawDomain {
  domain?: string;
  status?: { certificateStatus?: string | null; dnsRecords?: RawDns | RawDns[] | null } | null;
}

function shape(d: RawDomain): RailwayDomainInfo {
  const raw = d.status?.dnsRecords;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const records: RailwayDnsRecord[] = list
    .map((r) => {
      const value = r.requiredValue ?? "";
      const valid =
        (r.status ?? "").toUpperCase().includes("VALID") ||
        (!!value && r.currentValue === value);
      return { type: r.recordType ?? "CNAME", name: r.fqdn || r.hostlabel || d.domain || "", value, ok: valid };
    })
    .filter((r) => r.value);
  const cert = d.status?.certificateStatus ?? null;
  const certOk = !!cert && /issued|valid|ready|active/i.test(cert);
  return {
    dnsRecords: records,
    certificateStatus: cert,
    connected: certOk && records.length > 0 && records.every((r) => r.ok),
  };
}

/* ── The two operations the app needs ─────────────────────────────────────── */

/** Look up a domain the service already has, by name. */
async function lookup(c: Cfg, domain: string): Promise<RailwayDomainInfo | null> {
  const query = `query($projectId: String!, $environmentId: String!, $serviceId: String!) {
    domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
      customDomains { ${DOMAIN_FIELDS} }
    }
  }`;
  const data = await call<{ domains: { customDomains: RawDomain[] } }>(c, query, {
    projectId: c.projectId,
    environmentId: c.environmentId,
    serviceId: c.serviceId,
  });
  const bare = domain.toLowerCase();
  const found = data.domains.customDomains.find((d) => (d.domain ?? "").toLowerCase() === bare);
  return found ? shape(found) : null;
}

/**
 * Register `domain` on the Railway service and return the DNS record the owner
 * must add. If it's already registered (e.g. they re-added it), look it up
 * instead of failing — connecting the same domain twice is not a user error.
 * Returns null when the integration isn't configured.
 */
export async function registerRailwayDomain(domain: string): Promise<RailwayDomainInfo | null> {
  const c = cfg();
  if (!c) return null;
  const mutation = `mutation($input: CustomDomainCreateInput!) {
    customDomainCreate(input: $input) { ${DOMAIN_FIELDS} }
  }`;
  try {
    const data = await call<{ customDomainCreate: RawDomain }>(c, mutation, {
      input: { domain, projectId: c.projectId, environmentId: c.environmentId, serviceId: c.serviceId },
    });
    return shape(data.customDomainCreate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already|exist|taken|duplicate/i.test(msg)) {
      const found = await lookup(c, domain).catch(() => null);
      if (found) return found;
    }
    throw err;
  }
}

/** Current DNS + certificate status for a domain, or null if not configured. */
export async function railwayDomainStatus(domain: string): Promise<RailwayDomainInfo | null> {
  const c = cfg();
  if (!c) return null;
  return lookup(c, domain);
}
