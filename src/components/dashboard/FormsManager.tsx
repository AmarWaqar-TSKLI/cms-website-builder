"use client";

/**
 * The forms inbox.
 *
 * Everything a visitor sent through a Contact or Newsletter block, grouped by
 * which form it came from. Submissions are Tier-2 live data written by the public
 * runtime endpoint — nothing here publishes or versions anything; it only reads,
 * marks read, and deletes.
 */
import { useMemo, useState } from "react";
import { Badge, cx } from "../ui";
import { Ago } from "./Ago";
import { Btn, Card, CardHead } from "./dash-ui";

export interface Submission {
  id: string;
  formKey: string;
  formName: string;
  data: unknown;
  email: string | null;
  readAt: string | null;
  createdAt: string;
}

export function FormsManager({ siteId, initial }: { siteId: string; initial: Submission[] }) {
  const [subs, setSubs] = useState<Submission[]>(initial);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; items: Submission[] }>();
    for (const s of subs) {
      const g = map.get(s.formKey) ?? { key: s.formKey, name: s.formName || s.formKey, items: [] };
      g.items.push(s);
      map.set(s.formKey, g);
    }
    return [...map.values()];
  }, [subs]);

  async function setRead(id: string, read: boolean) {
    // Optimistic — a failed mark-read is not worth a spinner.
    setSubs((list) =>
      list.map((s) => (s.id === id ? { ...s, readAt: read ? new Date().toISOString() : null } : s)),
    );
    await fetch(`/api/forms/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    }).catch(() => {});
  }

  async function remove(id: string) {
    setConfirmId(null);
    setSubs((list) => list.filter((s) => s.id !== id));
    await fetch(`/api/forms/submissions/${id}`, { method: "DELETE" }).catch(() => {});
  }

  if (subs.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-[14px] font-medium text-ink-100">No messages yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-ink-400">
          Add a <span className="font-medium text-ink-200">Contact form</span> or{" "}
          <span className="font-medium text-ink-200">Newsletter signup</span> block to a page and
          publish it. Whatever visitors send arrives here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const unread = group.items.filter((s) => !s.readAt).length;
        return (
          <Card key={group.key} className="p-5 sm:p-6">
            <CardHead
              title={group.name}
              hint={`${group.items.length} ${group.items.length === 1 ? "message" : "messages"}${
                unread ? ` · ${unread} unread` : ""
              }`}
              tables="form_submissions"
            />
            <ul className="mt-4 space-y-2.5">
              {group.items.map((s) => (
                <SubmissionRow
                  key={s.id}
                  submission={s}
                  confirming={confirmId === s.id}
                  onConfirm={() => setConfirmId(s.id)}
                  onCancelConfirm={() => setConfirmId(null)}
                  onDelete={() => remove(s.id)}
                  onRead={(read) => setRead(s.id, read)}
                />
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function SubmissionRow({
  submission: s,
  confirming,
  onConfirm,
  onCancelConfirm,
  onDelete,
  onRead,
}: {
  submission: Submission;
  confirming: boolean;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onDelete: () => void;
  onRead: (read: boolean) => void;
}) {
  const unread = !s.readAt;
  const fields =
    s.data && typeof s.data === "object" && !Array.isArray(s.data)
      ? Object.entries(s.data as Record<string, unknown>)
      : [];

  return (
    <li
      className={cx(
        "rounded-xl border p-3.5 transition-colors",
        unread ? "border-flux-500/30 bg-flux-500/[0.04]" : "border-ink-800 bg-ink-950/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {unread && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-flux-400" />}
        {s.email ? (
          <a
            href={`mailto:${s.email}`}
            className="text-[13px] font-medium text-ink-100 underline decoration-ink-700 underline-offset-2 hover:decoration-flux-300"
          >
            {s.email}
          </a>
        ) : (
          <span className="text-[13px] font-medium text-ink-200">Submission</span>
        )}
        {unread && <Badge tone="neutral">New</Badge>}
        <span className="ml-auto text-[11px] text-ink-500">
          <Ago at={s.createdAt} fallback="recently" />
        </span>
      </div>

      {fields.length > 0 && (
        <dl className="mt-2.5 grid gap-1.5">
          {fields.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[minmax(0,110px)_1fr] gap-3">
              <dt className="truncate text-[11.5px] font-medium capitalize text-ink-500">{key}</dt>
              <dd className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-ink-200">
                {String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Btn variant="quiet" size="xs" onClick={() => onRead(unread)}>
          {unread ? "Mark read" : "Mark unread"}
        </Btn>
        {confirming ? (
          <>
            <Btn variant="danger" size="xs" onClick={onDelete}>
              Delete for good
            </Btn>
            <Btn variant="ghost" size="xs" onClick={onCancelConfirm}>
              Cancel
            </Btn>
          </>
        ) : (
          <Btn
            variant="ghost"
            size="xs"
            className="hover:border-fail-500/50 hover:text-fail-500"
            onClick={onConfirm}
          >
            Delete
          </Btn>
        )}
      </div>
    </li>
  );
}
