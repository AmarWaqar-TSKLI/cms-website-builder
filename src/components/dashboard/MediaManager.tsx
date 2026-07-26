"use client";

/**
 * The image library, managed.
 *
 * Upload one or several at once (each is downscaled in the browser to a data
 * URI — see lib/media-client), give each a bit of alt text for accessibility,
 * and remove the ones you don't need. Removing is soft and safe: sites you've
 * already published froze their own copy of each image, so a delete here only
 * affects your drafts and the next publish, never a live visitor.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareImageForUpload } from "@/lib/media-client";
import { Card, CardHead } from "./dash-ui";
import { Btn } from "./dash-ui";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";

interface MediaItem {
  id: string;
  url: string;
  filename: string | null;
  alt: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
}

function kb(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaManager({ siteId, initial }: { siteId: string; initial: MediaItem[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaItem[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    setBusy(true);
    setError(null);
    const added: MediaItem[] = [];
    try {
      for (const file of files) {
        const prepared = await prepareImageForUpload(file);
        const res = await fetch(`/api/sites/${siteId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataUri: prepared.dataUri,
            filename: prepared.filename,
            alt: prepared.filename.replace(/\.[a-z0-9]+$/i, ""),
            width: prepared.width,
            height: prepared.height,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(`${file.name}: ${data.error ?? "couldn’t be uploaded."}`);
          continue;
        }
        added.push((await res.json()) as MediaItem);
      }
      if (added.length) setItems((prev) => [...added, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong while uploading.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/media/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function saveAlt(id: string, alt: string) {
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, alt } : m)));
    await fetch(`/api/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alt }),
    });
  }

  return (
    <Card className="p-5 sm:p-6">
      <CardHead
        title="Your images"
        hint="Upload pictures to use on your pages. PNG, JPEG, WebP, GIF or SVG."
        tables="media"
        action={
          <Btn variant="primary" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? "Uploading…" : "Upload images"}
          </Btn>
        }
      />

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={onFiles}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      {error && (
        <div className="mt-4 rounded-lg border border-fail-500/40 bg-fail-500/10 px-3 py-2 text-[12px] text-fail-500">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="mt-5 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-ink-700 px-4 py-12 text-center transition-colors hover:border-flux-500/50 hover:bg-ink-950/40"
        >
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-flux-500/10 text-flux-300">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-[13.5px] font-medium text-ink-200">Upload your first image</span>
          <span className="max-w-xs text-[12px] leading-relaxed text-ink-500">
            Drag them in from your desktop, or click to browse. They’ll be ready to drop onto any
            page.
          </span>
        </button>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => (
            <li
              key={m.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-ink-800 bg-ink-950/60"
            >
              <div className="relative aspect-[4/3] bg-ink-900">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URI, no loader */}
                <img src={m.url} alt={m.alt ?? ""} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  title="Remove this image"
                  aria-label={`Remove ${m.filename ?? "image"}`}
                  className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-ink-950/70 text-[12px] text-ink-200 opacity-0 transition-opacity hover:bg-fail-500 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                <p className="truncate text-[11.5px] font-medium text-ink-200" title={m.filename ?? ""}>
                  {m.filename ?? "Image"}
                </p>
                <p className="text-[10.5px] text-ink-500">
                  {[m.width && m.height ? `${m.width}×${m.height}` : null, kb(m.sizeBytes)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <input
                  defaultValue={m.alt ?? ""}
                  placeholder="Describe it (alt text)"
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next !== (m.alt ?? "")) saveAlt(m.id, next);
                  }}
                  className="mt-auto w-full rounded-md border border-ink-800 bg-ink-950 px-2 py-1 text-[11px] text-ink-200 outline-none placeholder:text-ink-600 focus:border-flux-500"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 border-t border-ink-800 pt-3.5 text-[11.5px] leading-relaxed text-ink-500">
        Alt text describes a picture for people using a screen reader, and shows if the image can’t
        load. Removing an image here never changes a site you’ve already published.
      </p>
    </Card>
  );
}
