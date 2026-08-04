"use client";

/**
 * "Team" — who can work on this site's organisation, and inviting the next
 * person. The invite LINK is always shown once after creating (the token is
 * unrecoverable after that); email delivery is a bonus when the mail seam is
 * configured. Owner-only actions fail server-side with a clear message, so this
 * card can stay simple and let the API be the authority.
 */
import { useCallback, useEffect, useState } from "react";
import { cx } from "../ui";
import { Btn, Card, CardHead } from "./dash-ui";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: string;
  you: boolean;
}
interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

const MONO =
  "rounded-lg border border-ink-800 bg-ink-950/70 px-3 py-2 font-mono text-[12px] text-ink-200";

export function TeamCard({ siteId, className }: { siteId: string; className?: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "owner">("editor");
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [busy, setBusy] = useState<null | string>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const base = `/api/sites/${siteId}/team`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { members: Member[]; invites: PendingInvite[] };
      setMembers(data.members);
      setInvites(data.invites);
    } catch {
      /* keep prior state */
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    setBusy("invite");
    setError(null);
    setFreshUrl(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't create the invite.");
        return;
      }
      setFreshUrl(data.url as string);
      setEmailed(!!data.emailed);
      setEmail("");
      await load();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`${base}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) await load();
      else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className={cx("p-5 sm:p-6", className)}>
      <CardHead
        title="Team"
        hint="Everyone in this site's organisation can edit and publish it. Inviting is owner-only; an invite link works once, only for the invited email, and expires in 7 days."
        tables="memberships · invites"
      />

      <div className="mt-4 space-y-4">
        {/* Members */}
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">
            Members
          </div>
          {members === null ? (
            <p className="text-[12px] text-ink-500">Loading…</p>
          ) : (
            <ul className="space-y-1.5">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 bg-ink-950/60 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink-100">
                      {m.name}
                      {m.you ? <span className="text-ink-500"> (you)</span> : null}
                    </span>
                    <span className="block truncate text-[11px] text-ink-500">{m.email}</span>
                  </span>
                  <span className="shrink-0 rounded-md border border-ink-700 px-2 py-0.5 text-[10.5px] font-medium text-ink-400">
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pending invites */}
        {invites.length ? (
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">
              Pending invites
            </div>
            <ul className="space-y-1.5">
              {invites.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 bg-ink-950/60 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[12px] text-ink-200">
                      {i.email}
                    </span>
                    <span className="block text-[10.5px] text-ink-500">as {i.role}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void revoke(i.id)}
                    disabled={busy === i.id}
                    className="shrink-0 rounded-md border border-ink-700 px-2.5 py-1 text-[11px] font-medium text-ink-300 transition-colors hover:border-fail-500/50 hover:text-fail-500 disabled:opacity-40"
                  >
                    {busy === i.id ? "Revoking…" : "Revoke"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Fresh invite link — shown once */}
        {freshUrl ? (
          <div className="rounded-xl border border-live-500/35 bg-live-500/[0.06] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-live-500">
                Invite created{emailed ? " and emailed" : ""} — share this link
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(freshUrl).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  });
                }}
                className="rounded-md border border-live-500/40 px-2 py-1 text-[11px] font-medium text-live-500 hover:bg-live-500/10"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <div className={cx(MONO, "mt-2 break-all")}>{freshUrl}</div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              Shown once — the link holds the secret and we store only a hash. It works only for the
              invited email.
            </p>
          </div>
        ) : null}

        {/* Invite form */}
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">
            Invite someone
          </div>
          {error && <p className="mb-2 text-[12px] text-fail-500">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13px] text-ink-100 placeholder:text-ink-600 focus:border-flux-500 focus:outline-none"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value === "owner" ? "owner" : "editor")}
              className="rounded-lg border border-ink-700 bg-ink-950 px-2 py-2 text-[13px] text-ink-100 focus:border-flux-500 focus:outline-none"
            >
              <option value="editor">Editor</option>
              <option value="owner">Owner</option>
            </select>
            <Btn
              variant="primary"
              size="sm"
              onClick={() => void invite()}
              disabled={busy === "invite" || !email.trim()}
            >
              {busy === "invite" ? "Inviting…" : "Invite"}
            </Btn>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
            Editors build and publish. Owners can also delete the site, manage its domain and keys,
            and run the team.
          </p>
        </div>
      </div>
    </Card>
  );
}
