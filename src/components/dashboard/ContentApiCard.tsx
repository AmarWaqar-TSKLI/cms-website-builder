"use client";

/**
 * "Content API" — the headless half of the platform.
 *
 * Every published site is already served off an immutable release; this exposes
 * that same content as JSON a developer can consume anywhere. The owner mints a
 * read-only key (shown once), copies the endpoint, and drops the snippet into
 * their own app. Keys are hashed server-side, so this screen can list them but
 * never show a secret twice.
 */
import { useCallback, useEffect, useState } from "react";
import { cx } from "../ui";
import { Btn, Card, CardHead } from "./dash-ui";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const MONO =
  "rounded-lg border border-ink-800 bg-ink-950/70 px-3 py-2 font-mono text-[12px] text-ink-200";

export function ContentApiCard({
  siteId,
  slug,
  className,
}: {
  siteId: string;
  slug: string;
  className?: string;
}) {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null); // plaintext, shown once
  const [busy, setBusy] = useState<null | "create" | string>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const base = `/api/sites/${siteId}/api-keys`;
  const endpoint = `${origin}/api/v1/sites/${slug}/content`;

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { cache: "no-store" });
      if (res.ok) setKeys(((await res.json()) as { keys: KeyRow[] }).keys);
    } catch {
      /* leave prior state; a failed refresh isn't worth a banner */
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = useCallback(async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1200);
    } catch {
      /* value is on screen to select by hand */
    }
  }, []);

  async function create() {
    setBusy("create");
    setError(null);
    setFresh(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "API key" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create a key.");
        return;
      }
      setFresh(data.token as string);
      await load();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`${base}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) setKeys(((await res.json()) as { keys: KeyRow[] }).keys);
    } finally {
      setBusy(null);
    }
  }

  const sample = fresh ?? "cms_live_…";
  const curl = `curl ${endpoint} \\\n  -H "Authorization: Bearer ${sample}"`;

  return (
    <Card className={cx("p-5 sm:p-6", className)}>
      <CardHead
        title="Content API"
        hint="Serve this site's content as JSON to any app — your published pages, theme and data, behind a read-only key. This is the headless half: build visually here, consume it anywhere."
        tables="api_keys"
        action={<span className="rounded-md border border-ink-700 px-2 py-0.5 text-[10.5px] font-medium text-ink-400">Developers</span>}
      />

      <div className="mt-4 space-y-4">
        {/* Endpoint */}
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">
            Endpoint
          </div>
          <button
            type="button"
            onClick={() => void copy(endpoint, "endpoint")}
            className={cx(MONO, "flex w-full items-center justify-between gap-3 text-left hover:border-ink-600")}
            title="Click to copy"
          >
            <span className="break-all">
              <span className="text-live-500">GET</span> {endpoint || "/api/v1/sites/…/content"}
            </span>
            <span className="shrink-0 text-[11px] text-ink-500">
              {copied === "endpoint" ? "Copied" : "Copy"}
            </span>
          </button>
        </div>

        {/* Freshly-minted key — the ONE time the secret is shown */}
        {fresh && (
          <div className="rounded-xl border border-live-500/35 bg-live-500/[0.06] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-live-500">
                Your new key — copy it now
              </span>
              <button
                type="button"
                onClick={() => void copy(fresh, "fresh")}
                className="rounded-md border border-live-500/40 px-2 py-1 text-[11px] font-medium text-live-500 hover:bg-live-500/10"
              >
                {copied === "fresh" ? "Copied" : "Copy key"}
              </button>
            </div>
            <div className={cx(MONO, "mt-2 break-all")}>{fresh}</div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              This is the only time it's shown — we store a hash, never the key itself. If you lose
              it, revoke it and make a new one.
            </p>
          </div>
        )}

        {/* Existing keys */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Keys</span>
            <Btn variant="primary" size="sm" onClick={() => void create()} disabled={busy === "create"}>
              {busy === "create" ? "Creating…" : "Create key"}
            </Btn>
          </div>
          {error && <p className="mb-2 text-[12px] text-fail-500">{error}</p>}
          {keys === null ? (
            <p className="text-[12px] text-ink-500">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-700 px-3 py-4 text-center text-[12px] text-ink-500">
              No keys yet. Create one to start calling the API.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 bg-ink-950/60 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-[12px] text-ink-200">{k.prefix}</span>
                    <span className="block text-[10.5px] text-ink-500">
                      {k.lastUsedAt ? "Last used recently" : "Never used"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void revoke(k.id)}
                    disabled={busy === k.id}
                    className="shrink-0 rounded-md border border-ink-700 px-2.5 py-1 text-[11px] font-medium text-ink-300 transition-colors hover:border-fail-500/50 hover:text-fail-500 disabled:opacity-40"
                  >
                    {busy === k.id ? "Revoking…" : "Revoke"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Copy-paste snippet */}
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">
            Try it
          </div>
          <div className="relative">
            <pre className={cx(MONO, "overflow-x-auto whitespace-pre leading-relaxed")}>{curl}</pre>
            <button
              type="button"
              onClick={() => void copy(curl, "curl")}
              className="absolute right-2 top-2 rounded-md border border-ink-700 bg-ink-900 px-2 py-0.5 text-[10.5px] text-ink-400 hover:text-ink-100"
            >
              {copied === "curl" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
            Returns your pages as ordered blocks, plus theme, nav and any store/blog data — all
            served off the immutable release, so rolling back the site rolls back the API too.
          </p>
        </div>
      </div>
    </Card>
  );
}
