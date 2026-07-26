"use client";

/**
 * The image control in the properties panel.
 *
 * The old control was a dropdown of "Image 1, Image 2" — you could only pick one
 * of the three seeded pictures, and you couldn't see any of them. This shows real
 * thumbnails, lets you upload your own, and lets you clear the choice.
 *
 * Upload path: the browser downscales the file to a data URI (see
 * lib/media-client), POSTs it, then selects it. Because a fresh image has to
 * reach the canvas's render context — not just this dropdown — the current draft
 * is flushed and the editor reloaded, exactly as "Make component" does. Choosing
 * an image that already exists needs none of that: it's already in context.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flushDraft } from "@/lib/editor/useAutosave";
import type { ResolvedMedia } from "@/lib/registry/types";
import { prepareImageForUpload } from "@/lib/media-client";
import { cx } from "../ui";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";

export function MediaField({
  value,
  onChange,
  siteId,
  media,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  siteId: string;
  media: Record<string, ResolvedMedia>;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  const selected = value ? media[value] : undefined;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again after a failure
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
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
        setError(data.error ?? "That image couldn’t be uploaded.");
        return;
      }
      const created = (await res.json()) as { id: string };
      // Point this block at the new image, persist, and reload so the canvas's
      // render context and the picker both learn about it.
      onChange(created.id);
      await flushDraft();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That image couldn’t be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        onChange={onFile}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      {/* Current selection */}
      <div className="flex items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-950 p-2">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-ink-800 bg-ink-900">
          {selected && !selected.missing ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI, no loader
            <img src={selected.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[9px] text-ink-500">{value ? "gone" : "none"}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] font-medium text-ink-200">
            {selected
              ? options.find((o) => o.value === value)?.label ?? "Image"
              : "No image chosen"}
          </p>
          <p className="text-[10.5px] text-ink-500">
            {busy ? "Uploading…" : selected ? "Replace or remove below" : "Upload or choose one"}
          </p>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="rounded-md border border-flux-500/40 px-2.5 py-1 text-[11px] font-medium text-flux-300 transition-colors hover:border-flux-500 hover:bg-flux-500/10 disabled:opacity-50"
        >
          Upload
        </button>
        {options.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setChoosing((v) => !v)}
            className="rounded-md border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-100 disabled:opacity-50"
          >
            {choosing ? "Close" : "Choose"}
          </button>
        )}
        {value && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange("")}
            className="rounded-md border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:border-fail-500/50 hover:text-fail-500 disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>

      {error && <p className="mt-1.5 text-[10.5px] leading-snug text-fail-500">{error}</p>}

      {/* Library — thumbnails of everything the site already has. */}
      {choosing && options.length > 0 && (
        <div className="mt-2 grid max-h-52 grid-cols-3 gap-1.5 overflow-y-auto rounded-lg border border-ink-800 bg-ink-950 p-1.5">
          {options.map((o) => {
            const m = media[o.value];
            const isCurrent = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                title={o.label}
                onClick={() => {
                  onChange(o.value);
                  setChoosing(false);
                }}
                className={cx(
                  "aspect-square overflow-hidden rounded-md border transition-colors",
                  isCurrent ? "border-flux-500 ring-1 ring-flux-500" : "border-ink-800 hover:border-flux-500/50",
                )}
              >
                {m && !m.missing ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URI, no loader
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-[9px] text-ink-500">
                    gone
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
