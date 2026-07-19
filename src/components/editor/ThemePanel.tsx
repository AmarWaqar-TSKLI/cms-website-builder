"use client";

/**
 * Site-wide design controls.
 *
 * These edit theme tokens, which every component reads. Change the accent here
 * and every button on every page follows — that is what makes it a theme rather
 * than a find-and-replace.
 *
 * Saving appends a theme revision rather than overwriting one, so the design is
 * versioned on exactly the same terms as the pages.
 */
import { useCallback, useEffect, useState } from "react";
import type { ThemeLayout, ThemeTokens } from "@/lib/registry/types";
import { cx } from "../ui";

const COLOURS: { key: keyof ThemeTokens; label: string }[] = [
  { key: "colorBg", label: "Page background" },
  { key: "colorFg", label: "Text" },
  { key: "colorSurface", label: "Surface" },
  { key: "colorBorder", label: "Borders" },
  { key: "colorAccent", label: "Accent" },
  { key: "colorAccentFg", label: "Accent text" },
  { key: "colorMuted", label: "Muted text" },
];

const FONTS = [
  { label: "Inter (sans)", value: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { label: "Georgia (serif)", value: "Georgia, 'Times New Roman', serif" },
  { label: "System mono", value: "ui-monospace, 'SF Mono', Menlo, monospace" },
  { label: "Trebuchet", value: "'Trebuchet MS', 'Segoe UI', sans-serif" },
];

const PRESETS: { name: string; tokens: Partial<ThemeTokens> }[] = [
  {
    name: "Studio",
    tokens: { colorBg: "#ffffff", colorFg: "#0b0b0f", colorSurface: "#f4f4f6", colorBorder: "#e4e4e7", colorAccent: "#1b1b6f", colorAccentFg: "#ffffff", colorMuted: "#6b6b76" },
  },
  {
    name: "Ink",
    tokens: { colorBg: "#0c0c10", colorFg: "#f2f2f5", colorSurface: "#16161c", colorBorder: "#2a2a33", colorAccent: "#6d5cff", colorAccentFg: "#ffffff", colorMuted: "#9a9aad" },
  },
  {
    name: "Sand",
    tokens: { colorBg: "#faf7f2", colorFg: "#221d16", colorSurface: "#f1ebe1", colorBorder: "#e0d6c7", colorAccent: "#9a5b2c", colorAccentFg: "#ffffff", colorMuted: "#7a6a58" },
  },
  {
    name: "Forest",
    tokens: { colorBg: "#ffffff", colorFg: "#10201a", colorSurface: "#eef4f1", colorBorder: "#d6e3dc", colorAccent: "#12734f", colorAccentFg: "#ffffff", colorMuted: "#5d7169" },
  },
];

export function ThemePanel({
  siteId,
  tokens,
  layout,
  onChange,
}: {
  siteId: string;
  tokens: ThemeTokens;
  layout: ThemeLayout;
  /** Applied to the canvas immediately, so changes are visible while editing. */
  onChange: (tokens: ThemeTokens, layout: ThemeLayout) => void;
}) {
  const [draftTokens, setDraftTokens] = useState<ThemeTokens>(tokens);
  const [draftLayout, setDraftLayout] = useState<ThemeLayout>(layout);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => setDraftTokens(tokens), [tokens]);
  useEffect(() => setDraftLayout(layout), [layout]);

  const patchTokens = useCallback(
    (patch: Partial<ThemeTokens>) => {
      const next = { ...draftTokens, ...patch };
      setDraftTokens(next);
      setDirty(true);
      onChange(next, draftLayout);
    },
    [draftTokens, draftLayout, onChange],
  );

  const patchLayout = useCallback(
    (patch: Partial<ThemeLayout>) => {
      const next = { ...draftLayout, ...patch };
      setDraftLayout(next);
      setDirty(true);
      onChange(draftTokens, next);
    },
    [draftTokens, draftLayout, onChange],
  );

  const save = async () => {
    setSaving(true);
    setSaved(null);
    const res = await fetch(`/api/sites/${siteId}/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: draftTokens, layout: draftLayout }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      setDirty(false);
      setSaved(`Saved as theme v${data.versionNo}`);
      setTimeout(() => setSaved(null), 4000);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-800 p-4">
        <p className="text-[13px] font-semibold text-ink-100">Site design</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">
          Applies to every page. Saving appends a new theme version rather than
          overwriting the old one.
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div>
          <SectionTitle>Presets</SectionTitle>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => patchTokens(p.tokens)}
                className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-950 px-2.5 py-2 transition-colors hover:border-flux-500/50"
              >
                <span className="flex -space-x-1">
                  {[p.tokens.colorBg, p.tokens.colorAccent, p.tokens.colorFg].map((c, i) => (
                    <span
                      key={i}
                      className="h-3.5 w-3.5 rounded-full border border-ink-700"
                      style={{ background: c }}
                    />
                  ))}
                </span>
                <span className="text-[11.5px] text-ink-200">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionTitle>Colours</SectionTitle>
          <div className="space-y-2">
            {COLOURS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={String(draftTokens[key] ?? "#000000")}
                  onChange={(e) => patchTokens({ [key]: e.target.value } as Partial<ThemeTokens>)}
                  className="h-6 w-8 shrink-0 cursor-pointer rounded-md border border-ink-700 bg-transparent p-0"
                />
                <span className="flex-1 text-[11.5px] text-ink-300">{label}</span>
                <input
                  value={String(draftTokens[key] ?? "")}
                  onChange={(e) => patchTokens({ [key]: e.target.value } as Partial<ThemeTokens>)}
                  className="w-20 rounded-md border border-ink-800 bg-ink-950 px-1.5 py-0.5 text-right font-mono text-[10.5px] text-ink-400 outline-none focus:border-flux-500"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionTitle>Typography</SectionTitle>
          <label className="mb-2 block">
            <span className="mb-1 block text-[11.5px] text-ink-300">Headings</span>
            <select
              value={draftTokens.fontHeading}
              onChange={(e) => patchTokens({ fontHeading: e.target.value })}
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-[12px] text-ink-100 outline-none focus:border-flux-500"
            >
              {FONTS.map((f) => (
                <option key={f.label} value={f.value}>{f.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-ink-300">Body</span>
            <select
              value={draftTokens.fontBody}
              onChange={(e) => patchTokens({ fontBody: e.target.value })}
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-[12px] text-ink-100 outline-none focus:border-flux-500"
            >
              {FONTS.map((f) => (
                <option key={f.label} value={f.value}>{f.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <SectionTitle>Shape</SectionTitle>
          <Slider
            label="Corner radius"
            value={parseInt(draftTokens.radius) || 0}
            min={0}
            max={32}
            unit="px"
            onChange={(v) => patchTokens({ radius: `${v}px` })}
          />
          <Slider
            label="Page width"
            value={parseInt(draftTokens.maxWidth) || 1120}
            min={720}
            max={1600}
            step={20}
            unit="px"
            onChange={(v) => patchTokens({ maxWidth: `${v}px` })}
          />
        </div>

        <div>
          <SectionTitle>Header &amp; footer</SectionTitle>
          <label className="mb-2 block">
            <span className="mb-1 block text-[11.5px] text-ink-300">Brand name</span>
            <input
              value={draftLayout.nav?.brand ?? ""}
              onChange={(e) =>
                patchLayout({ nav: { ...draftLayout.nav, brand: e.target.value } })
              }
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-ink-100 outline-none focus:border-flux-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] text-ink-300">Footer text</span>
            <input
              value={draftLayout.footer?.text ?? ""}
              onChange={(e) =>
                patchLayout({ footer: { ...draftLayout.footer, text: e.target.value } })
              }
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-ink-100 outline-none focus:border-flux-500"
            />
          </label>
        </div>
      </div>

      <div className="border-t border-ink-800 p-3">
        {saved && <p className="mb-2 text-[11.5px] text-live-500">{saved}</p>}
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className={cx(
            "w-full rounded-lg px-3 py-2 text-[12.5px] font-semibold transition-colors",
            dirty
              ? "bg-flux-500 text-white hover:bg-flux-400"
              : "cursor-not-allowed bg-ink-850 text-ink-500",
          )}
        >
          {saving ? "Saving…" : dirty ? "Save design" : "No changes"}
        </button>
        <p className="mt-2 text-[10.5px] leading-relaxed text-ink-500">
          Saved designs still need a publish to reach the live site.
        </p>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-2">
      <span className="mb-1 block text-[11.5px] text-ink-300">{label}</span>
      <div className="flex items-center gap-2.5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-flux-500"
        />
        <span className="w-14 shrink-0 rounded-md border border-ink-800 bg-ink-950 px-1.5 py-0.5 text-center font-mono text-[11px] text-ink-300">
          {value}
          {unit}
        </span>
      </div>
    </div>
  );
}
