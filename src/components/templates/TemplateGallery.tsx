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
    <div className="grid gap-8 sm:grid-cols-2">
      {templates.map((t) => (
        <div
          key={t.id}
          data-template-id={t.id}
          className="flex flex-col border-2 border-coal bg-white shadow-[6px_6px_0_var(--color-coal)]"
        >
          <div className="border-b-2 border-coal">
            <Preview tokens={t.tokens} name={t.name} />
          </div>
          <div className="flex flex-1 flex-col p-5">
            <p className="kicker text-[11px] text-tomato">{t.category}</p>
            <h2 className="display mt-1.5 text-[24px] text-coal">{t.name}</h2>
            <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-coal/75">{t.tagline}</p>
            <button
              type="button"
              onClick={() => use(t.id)}
              disabled={!!busyId}
              className="btn-poster mt-5 justify-center bg-tomato text-[14px] text-paper disabled:opacity-50"
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
