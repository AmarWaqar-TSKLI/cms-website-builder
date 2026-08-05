"use client";

/**
 * "Use your own domain" — the self-serve half of custom domains.
 *
 * The serving half is already real (the request path matches the Host header
 * against sites.custom_domain). This is the screen a non-technical owner uses to
 * register one: type golotto.com, get the exact DNS setup, and watch it flip to
 * "connected" once the internet agrees.
 *
 * The two ways to point a domain are ALWAYS on screen — before you connect
 * (so you know what you're signing up for), while DNS propagates, and tucked
 * into a disclosure once it's live. A domain that was already pointing at us
 * connects instantly, and previously that skipped the instructions entirely —
 * leaving the owner staring at "Connected" with no idea what just happened.
 */
import { useCallback, useEffect, useState } from "react";
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
        /* ── Not connected: the add form, with both methods in plain sight ── */
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
          <div className="mt-4">
            <Methods state={state} domain={input.trim() || null} />
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">
            Don't own a domain yet? You can still connect one — nothing breaks, and your site keeps
            working at its <span className="font-mono text-ink-400">/s/</span> address.
          </p>
        </div>
      ) : (
        /* ── Connected: the domain, DNS setup, and controls ──────────────── */
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

          {state?.status === "connected" ? (
            /* Live: the setup collapses into a disclosure, but never vanishes —
               "how is this wired?" must always have an answer on this card. */
            <details className="group rounded-xl border border-ink-800 bg-ink-950/40">
              <summary className="cursor-pointer list-none rounded-xl px-4 py-2.5 text-[12px] font-medium text-ink-400 transition-colors hover:text-ink-100">
                <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>
                How this domain is wired — the DNS setup
              </summary>
              <div className="border-t border-ink-800 p-4">
                <Methods state={state} domain={domain} />
              </div>
            </details>
          ) : (
            <Methods state={state} domain={domain} />
          )}

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

/* ── the two ways to point a domain, side by side ────────────────────────── */

/**
 * Option A — delegate your nameservers to us; we run every record and the
 * certificate from then on (the Vercel/Netlify model). Option B — keep your
 * DNS provider and add a single record. Both are always rendered so the choice
 * is visible BEFORE connecting, not discovered afterwards.
 */
function Methods({ state, domain }: { state: DomainState | null; domain: string | null }) {
  const nameservers = state?.managed?.active ? state.managed.nameservers : [];
  const records = recordRows(state, domain);

  if (!nameservers.length && !records) {
    // No public target yet (local dev). Be honest instead of inventing an IP.
    return (
      <div className="rounded-xl border border-dashed border-ink-700 bg-ink-950/40 px-4 py-3 text-[12px] leading-relaxed text-ink-400">
        This builder isn't on a public server yet, so there's no address to point a domain at. Once
        it's deployed, the exact DNS setup shows up right here.
      </div>
    );
  }

  return (
    <div className={cx("grid gap-3", nameservers.length && records ? "lg:grid-cols-2" : "")}>
      {nameservers.length > 0 && (
        <MethodBox
          badge="Option A · Recommended"
          title="We run your DNS"
          blurb="At your registrar, replace the nameservers with these two. That's the only change you ever make — every record and the certificate are handled from here."
          note="Nameserver changes can take a few minutes to a few hours. This flips to Connected on its own."
        >
          <div className="space-y-1.5">
            {nameservers.map((ns) => (
              <CopyRow key={ns} value={ns} />
            ))}
          </div>
        </MethodBox>
      )}

      {records && (
        <MethodBox
          badge={nameservers.length ? "Option B" : "One record"}
          title="Keep your DNS — add one record"
          blurb="Prefer to stay with your current provider (GoDaddy, Namecheap, Cloudflare…)? Add this single record instead. Either method works — you only need one."
          note="Records usually go live within the hour. The certificate is issued automatically on the first visit."
        >
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
                    <td className="pr-4 align-top">{r.type}</td>
                    <td className="pr-4 align-top break-all">{r.name}</td>
                    <td className="break-all">
                      <CopyRow value={r.value} bare />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MethodBox>
      )}
    </div>
  );
}

/** The record(s) for the single-record path: the platform's own if the host
 * integration is wired, otherwise computed from the configured target. */
function recordRows(
  state: DomainState | null,
  domain: string | null,
): { type: string; name: string; value: string }[] | null {
  if (state?.railway?.dnsRecords?.length) return state.railway.dnsRecords;

  const target = state?.target;
  if (!target || target.kind === "none" || !target.value) return null;

  // "@" is registrar-speak for the bare domain; a subdomain uses its own label.
  const isSub = !!domain && domain.split(".").length > 2 && !domain.startsWith("www.");
  const host = isSub && domain ? domain.split(".")[0] : "@";
  return [{ type: target.kind === "a" ? "A" : "CNAME", name: host, value: target.value }];
}

function MethodBox({
  badge,
  title,
  blurb,
  note,
  children,
}: {
  badge: string;
  title: string;
  blurb: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-ink-800 bg-ink-950/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{badge}</Badge>
        <span className="text-[12.5px] font-semibold text-ink-200">{title}</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">{blurb}</p>
      <div className="mt-3">{children}</div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-600">{note}</p>
    </div>
  );
}

/** A click-to-copy value; `bare` renders without the boxed chrome (table cells). */
function CopyRow({ value, bare }: { value: string; bare?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — the value is right there to select by hand */
    }
  };

  if (bare) {
    return (
      <button
        type="button"
        onClick={() => void copy()}
        title="Click to copy"
        className="group inline-flex max-w-full items-baseline gap-2 text-left"
      >
        <span className="break-all">{value}</span>
        <span className="shrink-0 text-[10.5px] text-ink-500 group-hover:text-flux-300">
          {copied ? "Copied" : "Copy"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title="Click to copy"
      className="group flex w-full items-center justify-between gap-3 rounded-lg border border-ink-800 bg-ink-950/70 px-3 py-2 text-left font-mono text-[13px] text-ink-100 hover:border-ink-600"
    >
      <span className="break-all">{value}</span>
      <span className="shrink-0 text-[11px] text-ink-500 group-hover:text-flux-300">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
