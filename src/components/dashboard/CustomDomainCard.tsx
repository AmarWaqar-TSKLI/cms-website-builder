"use client";

/**
 * "Use your own domain" — the self-serve half of custom domains.
 *
 * The serving half is already real (the request path matches the Host header
 * against sites.custom_domain). This is the screen a non-technical owner uses to
 * register one: type golotto.com, get the exact DNS record to add, and watch it
 * flip to "connected" once the internet agrees.
 *
 * Honest about the one thing it can't fake: until the builder itself is on a
 * public server, there's nothing to point a domain AT, so the panel says so and
 * offers the local preview link instead of pretending.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge, Dot, cx } from "../ui";
import { Btn, Card, CardHead } from "./dash-ui";
import type { DomainTarget } from "@/lib/domains";

type Status = "none" | "connected" | "pending" | "unconfigured";

interface RailwayDnsRecord {
  type: string;
  name: string;
  value: string;
  ok: boolean;
}

interface DomainState {
  domain: string | null;
  status: Status;
  detail: string;
  target: DomainTarget;
  // Present when the host integration is wired up: the exact DNS record(s) to
  // add, straight from the platform, so the owner never leaves this app.
  railway?: { dnsRecords: RailwayDnsRecord[]; certificateStatus: string | null; connected: boolean } | null;
  // Present when WE run the DNS: the customer delegates their nameservers to us
  // once and we manage every record for them (the Vercel/Netlify model).
  managed?: { active: boolean; nameservers: string[] } | null;
}

const INPUT =
  "h-9 w-full min-w-0 rounded-lg border border-ink-700 bg-ink-950/70 px-3 font-mono text-[13px] text-ink-100 placeholder:text-ink-600 focus:border-flux-500 focus:outline-none focus:ring-2 focus:ring-flux-400/40";

export function CustomDomainCard({
  siteId,
  initialDomain,
  className,
}: {
  siteId: string;
  initialDomain: string | null;
  className?: string;
}) {
  const [state, setState] = useState<DomainState | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | "save" | "check" | "remove">(null);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/sites/${siteId}/domain`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { cache: "no-store" });
      if (res.ok) setState((await res.json()) as DomainState);
    } catch {
      /* leave the last known state; a failed refresh isn't worth an error banner */
    }
  }, [base]);

  // Seed from what the server already rendered, then refresh with a live check.
  useEffect(() => {
    setState({
      domain: initialDomain,
      status: initialDomain ? "pending" : "none",
      detail: "",
      target: { kind: "none", value: null },
    });
    void load();
  }, [initialDomain, load]);

  async function connect() {
    setError(null);
    setBusy("save");
    try {
      const res = await fetch(base, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: input }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't connect that domain.");
        return;
      }
      setState(data as DomainState);
      setInput("");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function recheck() {
    setBusy("check");
    await load();
    setBusy(null);
  }

  async function disconnect() {
    setBusy("remove");
    try {
      const res = await fetch(base, { method: "DELETE" });
      if (res.ok) setState((await res.json()) as DomainState);
    } finally {
      setBusy(null);
    }
  }

  const domain = state?.domain ?? null;

  return (
    <Card className={cx("p-5 sm:p-6", className)}>
      <CardHead
        title="Use your own domain"
        hint="Point a domain you own — like golotto.com — at this site, so visitors reach it there instead of the /s/ address."
        tables="sites.custom_domain"
        action={domain ? <StatusBadge status={state?.status ?? "pending"} busy={busy === "check"} /> : undefined}
      />

      {!domain ? (
        /* ── Not connected: the add form ─────────────────────────────────── */
        <div className="mt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={INPUT}
              placeholder="golotto.com"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim() && !busy) void connect();
              }}
              spellCheck={false}
              autoCapitalize="none"
              aria-label="Your domain"
            />
            <Btn
              variant="primary"
              size="sm"
              className="h-9 shrink-0 sm:w-auto"
              onClick={() => void connect()}
              disabled={!input.trim() || busy === "save"}
            >
              {busy === "save" ? "Connecting…" : "Connect domain"}
            </Btn>
          </div>
          {error && <p className="mt-2 text-[12px] text-fail-500">{error}</p>}
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">
            {state?.managed?.active ? (
              <>
                Point your domain's nameservers at ours once and we run its DNS from then on — the
                certificate and every record included. Prefer not to delegate? You'll also get a
                single record to add instead.
              </>
            ) : (
              <>
                You'll get the exact DNS record to add at your domain provider (GoDaddy, Namecheap,
                Cloudflare…).
              </>
            )}{" "}
            Don't own one yet? You can still connect it — nothing breaks, and your site keeps working
            at its <span className="font-mono text-ink-400">/s/</span> address.
          </p>
        </div>
      ) : (
        /* ── Connected: the domain, DNS steps, and controls ──────────────── */
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-ink-800 bg-ink-950/70 px-3 py-1.5 font-mono text-[13px] text-ink-100 hover:border-ink-600 hover:text-flux-300"
            >
              {domain} ↗
            </a>
            <a
              href={`/?host=${encodeURIComponent(domain)}`}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-ink-400 underline decoration-ink-600 underline-offset-2 hover:text-flux-300"
              title="Preview how this domain resolves, without needing DNS — handy while testing locally."
            >
              Test it
            </a>
          </div>

          {state?.detail && (
            <p
              className={cx(
                "text-[12.5px] leading-relaxed",
                state.status === "connected" ? "text-live-500" : "text-ink-400",
              )}
            >
              {state.detail}
            </p>
          )}

          {state?.status !== "connected" &&
            (state?.managed?.active && state.managed.nameservers.length ? (
              <NameserverInstructions
                nameservers={state.managed.nameservers}
                fallback={
                  state?.railway?.dnsRecords?.length ? (
                    <RailwayRecords records={state.railway.dnsRecords} />
                  ) : (
                    <DnsInstructions domain={domain} target={state?.target} />
                  )
                }
              />
            ) : state?.railway?.dnsRecords?.length ? (
              <RailwayRecords records={state.railway.dnsRecords} />
            ) : (
              <DnsInstructions domain={domain} target={state?.target} />
            ))}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Btn variant="secondary" size="sm" onClick={() => void recheck()} disabled={busy === "check"}>
              {busy === "check" ? "Checking…" : "Check again"}
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => void disconnect()} disabled={busy === "remove"}>
              {busy === "remove" ? "Removing…" : "Disconnect"}
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

function StatusBadge({ status, busy }: { status: Status; busy: boolean }) {
  if (busy) {
    return (
      <Badge tone="building">
        <Dot tone="building" pulse />
        Checking…
      </Badge>
    );
  }
  if (status === "connected") {
    return (
      <Badge tone="live">
        <Dot tone="live" />
        Connected
      </Badge>
    );
  }
  if (status === "unconfigured") {
    return <Badge tone="neutral">Ready to point</Badge>;
  }
  return (
    <Badge tone="warn">
      <Dot tone="warn" pulse />
      Waiting for DNS
    </Badge>
  );
}

/**
 * The premium path: hand the customer our nameservers. They change them ONCE at
 * their registrar and we own every record from then on — apex, www, subdomains,
 * the certificate, all of it. This is what "we host your domain" means, and it's
 * strictly less error-prone than copy-pasting a record, so it leads. The
 * single-record method stays one click away for people who'd rather not delegate.
 */
function NameserverInstructions({
  nameservers,
  fallback,
}: {
  nameservers: string[];
  fallback: ReactNode;
}) {
  const [showFallback, setShowFallback] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const copy = async (value: string, i: number) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1200);
    } catch {
      /* clipboard blocked — the value is right there to select by hand */
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-4">
        <div className="flex items-center gap-2">
          <Badge tone="neutral">Recommended</Badge>
          <span className="text-[12.5px] font-medium text-ink-200">Point your nameservers to us</span>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">
          At your domain provider, replace the nameservers with the two below. That's the only
          change you make — we handle every record and the certificate from here, and it keeps
          working even if our servers move.
        </p>
        <div className="mt-3 space-y-1.5">
          {nameservers.map((ns, i) => (
            <button
              key={ns}
              type="button"
              onClick={() => void copy(ns, i)}
              className="group flex w-full items-center justify-between gap-3 rounded-lg border border-ink-800 bg-ink-950/70 px-3 py-2 text-left font-mono text-[13px] text-ink-100 hover:border-ink-600"
              title="Click to copy"
            >
              <span className="break-all">{ns}</span>
              <span className="shrink-0 text-[11px] text-ink-500 group-hover:text-flux-300">
                {copied === i ? "Copied" : "Copy"}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-600">
          Nameserver changes can take a few minutes to a few hours to propagate. This flips to{" "}
          <span className="text-ink-400">Connected</span> automatically once it does.
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowFallback((v) => !v)}
          className="text-[11.5px] text-ink-500 underline decoration-ink-700 underline-offset-2 hover:text-flux-300"
        >
          {showFallback ? "Hide the single-record method" : "Prefer to add just one DNS record instead?"}
        </button>
        {showFallback && (
          <div className="mt-2.5">
            <p className="mb-2 text-[11.5px] leading-relaxed text-ink-500">
              If you'd rather keep your current nameservers, add this one record instead. Either
              method works — you only need one.
            </p>
            {fallback}
          </div>
        )}
      </div>
    </div>
  );
}

/** The exact DNS record(s) the host handed back — the self-serve path. */
function RailwayRecords({ records }: { records: RailwayDnsRecord[] }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-3">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="text-ink-500">
              <th className="pb-1.5 pr-4 font-medium">Type</th>
              <th className="pb-1.5 pr-4 font-medium">Name / Host</th>
              <th className="pb-1.5 font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="font-mono text-ink-200">
            {records.map((r, i) => (
              <tr key={i}>
                <td className="pr-4">{r.type}</td>
                <td className="pr-4 break-all">{r.name}</td>
                <td className="break-all">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">
        Add this at your domain provider (GoDaddy, Namecheap, Cloudflare…). The certificate is
        issued automatically — it usually goes live within an hour.
      </p>
    </div>
  );
}

/** The one DNS record to add, in the plainest terms the target allows. */
function DnsInstructions({ domain, target }: { domain: string; target?: DomainTarget }) {
  const isSub = domain.split(".").length > 2 && !domain.startsWith("www.");
  const host = isSub ? domain.split(".")[0] : "@";

  let rows: { type: string; name: string; value: string }[];
  let note: string;

  if (target?.kind === "a") {
    rows = [{ type: "A", name: host, value: target.value }];
    note = "Add this record at your domain provider. It usually goes live within an hour.";
  } else if (target?.kind === "cname") {
    rows = [{ type: "CNAME", name: host, value: target.value }];
    note = "Add this record at your domain provider. It usually goes live within an hour.";
  } else {
    // No public target yet (local dev). Be honest instead of inventing an IP.
    return (
      <div className="rounded-xl border border-dashed border-ink-700 bg-ink-950/40 px-4 py-3 text-[12px] leading-relaxed text-ink-400">
        This builder isn't on a public server yet, so there's no address to point{" "}
        <span className="font-mono text-ink-300">{domain}</span> at. Once it's deployed, the exact
        DNS record shows up right here. For now, use <strong className="text-ink-200">Test it</strong>{" "}
        above to see the domain resolve.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-3">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="text-ink-500">
              <th className="pb-1.5 pr-4 font-medium">Type</th>
              <th className="pb-1.5 pr-4 font-medium">Name / Host</th>
              <th className="pb-1.5 font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="font-mono text-ink-200">
            {rows.map((r) => (
              <tr key={r.type + r.name}>
                <td className="pr-4">{r.type}</td>
                <td className="pr-4">{r.name}</td>
                <td className="break-all">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">{note}</p>
    </div>
  );
}
