"use client";

/**
 * Write, version, publish.
 *
 * A list of posts on the left, an editor on the right. Saving the body appends a
 * new version (the point of post_revisions); the metadata is edited in place.
 * Publishing is a separate, deliberate step — a post stays private until you say
 * so, and only published posts can be featured on a page.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, cx } from "../ui";
import { Btn, Card, CardHead, relativeTime } from "./dash-ui";

interface PostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  status: "draft" | "published";
  publishedAt: string | null;
  revisionCount: number;
}

interface Draft {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  status: "draft" | "published";
  versionNo: number;
}

export function BlogManager({ siteId, initial }: { siteId: string; initial: PostRow[] }) {
  const router = useRouter();
  const [posts, setPosts] = useState<PostRow[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "publish" | "new" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Load the selected post's full text (the list doesn't carry bodies).
  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/posts/${selectedId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Couldn’t open that post."))))
      .then((d) => {
        if (!alive) return;
        setDraft({
          title: d.title,
          slug: d.slug,
          excerpt: d.excerpt ?? "",
          body: d.body ?? "",
          status: d.status,
          versionNo: d.versionNo ?? 0,
        });
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const patchDraft = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setSaved(false);
  };

  const createPost = useCallback(async () => {
    const title = window.prompt("Title for the new post")?.trim();
    if (!title) return;
    setBusy("new");
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn’t create the post.");
        return;
      }
      const created = await res.json();
      setPosts((prev) => [
        { id: created.id, title: created.title, slug: created.slug, excerpt: "", status: "draft", publishedAt: null, revisionCount: 1 },
        ...prev,
      ]);
      setSelectedId(created.id);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }, [siteId, router]);

  const save = useCallback(async () => {
    if (!selectedId || !draft) return;
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/posts/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          slug: draft.slug,
          excerpt: draft.excerpt,
          body: draft.body,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn’t save.");
        return;
      }
      const updated = await res.json();
      setDraft((d) => (d ? { ...d, slug: updated.slug } : d));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === selectedId
            ? { ...p, title: updated.title, slug: updated.slug, excerpt: updated.excerpt }
            : p,
        ),
      );
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }, [selectedId, draft, router]);

  const togglePublish = useCallback(async () => {
    if (!selectedId || !draft) return;
    const next = draft.status !== "published";
    setBusy("publish");
    setError(null);
    try {
      // Save first, so publishing never ships an older body than what's on screen.
      await fetch(`/api/posts/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          slug: draft.slug,
          excerpt: draft.excerpt,
          body: draft.body,
        }),
      });
      const res = await fetch(`/api/posts/${selectedId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: next }),
      });
      if (!res.ok) {
        setError("Couldn’t change whether this post is published.");
        return;
      }
      const data = await res.json();
      patchDraft({ status: data.status });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === selectedId ? { ...p, status: data.status, publishedAt: data.publishedAt } : p,
        ),
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }, [selectedId, draft, router]);

  const remove = useCallback(
    async (id: string, title: string) => {
      if (!window.confirm(`Delete “${title}”? This can’t be undone from here.`)) return;
      setBusy("delete");
      try {
        await fetch(`/api/posts/${id}`, { method: "DELETE" });
        setPosts((prev) => prev.filter((p) => p.id !== id));
        if (selectedId === id) setSelectedId(null);
        router.refresh();
      } finally {
        setBusy(null);
      }
    },
    [selectedId, router],
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-5">
      {/* ── List ─────────────────────────────────────────────────────────── */}
      <Card className="p-5 sm:p-6 lg:col-span-2">
        <CardHead
          title="Posts"
          hint="Drafts stay private until you publish them."
          tables="posts · post_revisions"
          action={
            <Btn variant="primary" size="sm" disabled={busy === "new"} onClick={createPost}>
              {busy === "new" ? "Adding…" : "New post"}
            </Btn>
          }
        />

        {posts.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-ink-700 px-4 py-8 text-center text-[12.5px] text-ink-400">
            No posts yet. Write your first one.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {posts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={cx(
                    "w-full rounded-xl border px-3.5 py-3 text-left transition-colors",
                    p.id === selectedId
                      ? "border-flux-500/50 bg-flux-500/[0.06]"
                      : "border-ink-800 bg-ink-950/60 hover:border-ink-700",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink-100">
                      {p.title}
                    </span>
                    {p.status === "published" ? (
                      <Badge tone="live">Published</Badge>
                    ) : (
                      <Badge tone="neutral">Draft</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-ink-500">
                    /{p.slug}
                    {p.status === "published" && p.publishedAt
                      ? ` · ${relativeTime(p.publishedAt)}`
                      : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Editor ───────────────────────────────────────────────────────── */}
      <Card className="p-5 sm:p-6 lg:col-span-3">
        {!selectedId ? (
          <p className="rounded-xl border border-dashed border-ink-700 px-4 py-12 text-center text-[12.5px] text-ink-400">
            Pick a post to edit, or start a new one.
          </p>
        ) : loading || !draft ? (
          <p className="py-12 text-center text-[12.5px] text-ink-500">Opening…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="display text-[17px] text-ink-100">Edit post</h2>
              <div className="flex items-center gap-2">
                {draft.status === "published" ? (
                  <Badge tone="live">Published</Badge>
                ) : (
                  <Badge tone="neutral">Draft</Badge>
                )}
                <span className="text-[11px] text-ink-500" title="Every saved body is a version">
                  v{draft.versionNo}
                </span>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-ink-300">Title</span>
              <input
                value={draft.title}
                onChange={(e) => patchDraft({ title: e.target.value })}
                className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13.5px] text-ink-100 outline-none focus:border-flux-500"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-ink-300">
                Web address
              </span>
              <div className="flex items-center rounded-lg border border-ink-700 bg-ink-950 pl-3">
                <span className="font-mono text-[12px] text-ink-500">/blog/</span>
                <input
                  value={draft.slug}
                  onChange={(e) => patchDraft({ slug: e.target.value })}
                  className="w-full bg-transparent px-1 py-2 font-mono text-[12.5px] text-ink-100 outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-ink-300">
                Summary <span className="font-normal text-ink-500">— shown in the list on a page</span>
              </span>
              <textarea
                rows={2}
                value={draft.excerpt}
                onChange={(e) => patchDraft({ excerpt: e.target.value })}
                className="w-full resize-y rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13px] leading-relaxed text-ink-100 outline-none focus:border-flux-500"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-ink-300">Body</span>
              <textarea
                rows={12}
                value={draft.body}
                onChange={(e) => patchDraft({ body: e.target.value })}
                placeholder="Write your post…"
                className="w-full resize-y rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[13.5px] leading-relaxed text-ink-100 outline-none placeholder:text-ink-600 focus:border-flux-500"
              />
            </label>

            {error && (
              <div className="rounded-lg border border-fail-500/40 bg-fail-500/10 px-3 py-2 text-[12px] text-fail-500">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-ink-800 pt-4">
              <Btn variant="primary" size="sm" disabled={busy !== null} onClick={save}>
                {busy === "save" ? "Saving…" : saved ? "Saved" : "Save"}
              </Btn>
              <Btn
                variant={draft.status === "published" ? "ghost" : "secondary"}
                size="sm"
                disabled={busy !== null}
                onClick={togglePublish}
              >
                {busy === "publish"
                  ? "Working…"
                  : draft.status === "published"
                    ? "Unpublish"
                    : "Publish"}
              </Btn>
              <Btn
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={busy !== null}
                onClick={() => remove(selectedId, draft.title)}
              >
                Delete
              </Btn>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-500">
              Publishing a post makes it available to feature on a page. It only appears to visitors
              once a page that lists it is itself published.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
