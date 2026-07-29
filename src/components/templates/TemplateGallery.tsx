"use client";

/**
 * The template gallery: pick a designed site to start from.
 *
 * Each card carries a tiny live PREVIEW rendered from the template's own theme
 * tokens — its real palette, accent and heading font — so you're choosing a look
 * you can actually see, not a name. "Use this template" POSTs the template id to
 * the same /api/sites endpoint the blank button uses and drops you into the
 * editor on the new site's home page.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ThemeTokens } from "@/lib/registry/types";

export interface TemplateCard {
  id: string;
  name: string;
  tagline: string;
  category: string;
  tokens: Partial<ThemeTokens>;
}

export function TemplateGallery({ templates }: { templates: TemplateCard[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function use(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBusyId(null);
        return;
      }
      if (data.pageId) router.push(`/editor/${data.pageId}`);
      else router.push(`/dashboard?site=${data.siteId}`);
    } catch {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {templates.map((t) => (
        <div
          key={t.id}
          data-template-id={t.id}
          className="flex flex-col overflow-hidden rounded-2xl border border-ink-800 bg-ink-900"
        >
          <Preview tokens={t.tokens} name={t.name} />
          <div className="flex flex-1 flex-col p-5">
            <div className="flex items-center gap-2">
              <h2 className="display text-[18px] text-ink-100">{t.name}</h2>
              <span className="rounded-full border border-ink-700 px-2 py-0.5 text-[10.5px] text-ink-400">
                {t.category}
              </span>
            </div>
            <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-ink-400">{t.tagline}</p>
            <button
              type="button"
              onClick={() => use(t.id)}
              disabled={!!busyId}
              className="mt-4 rounded-lg bg-flux-500 px-3 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-flux-400 disabled:opacity-50"
            >
              {busyId === t.id ? "Creating your site…" : "Use this template"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A small mock site rendered in the template's own colours and heading font. */
function Preview({ tokens: t, name }: { tokens: Partial<ThemeTokens>; name: string }) {
  const bg = t.colorBg ?? "#ffffff";
  const fg = t.colorFg ?? "#111111";
  const accent = t.colorAccent ?? "#333333";
  const accentFg = t.colorAccentFg ?? "#ffffff";
  const surface = t.colorSurface ?? "#f4f4f4";
  const border = t.colorBorder ?? "#e5e5e5";
  const heading = t.fontHeading ?? "Georgia, serif";
  const radius = t.radius ?? "8px";

  return (
    <div
      aria-hidden
      style={{
        background: bg,
        color: fg,
        fontFamily: heading,
        height: 168,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: `1px solid ${border}`,
          paddingBottom: 8,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: "-0.01em" }}>{name}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 10, fontSize: 8.5, opacity: 0.55 }}>
          <span>Home</span>
          <span>About</span>
        </span>
      </div>

      <div>
        <div style={{ height: 9, width: "72%", background: fg, opacity: 0.85, borderRadius: 3 }} />
        <div style={{ height: 6, width: "52%", background: fg, opacity: 0.32, borderRadius: 3, marginTop: 6 }} />
        <span
          style={{
            display: "inline-block",
            marginTop: 10,
            background: accent,
            color: accentFg,
            fontSize: 8.5,
            fontWeight: 600,
            padding: "3px 9px",
            borderRadius: radius,
          }}
        >
          Get started
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginTop: "auto" }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ background: surface, border: `1px solid ${border}`, borderRadius: radius, height: 34 }}
          />
        ))}
      </div>
    </div>
  );
}
