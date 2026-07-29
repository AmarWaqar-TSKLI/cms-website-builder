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
import { useTechnical } from "../technical";

const COLOURS: { key: keyof ThemeTokens; label: string }[] = [
  { key: "colorBg", label: "Page background" },
  { key: "colorFg", label: "Text" },
  { key: "colorSurface", label: "Surface" },
  { key: "colorBorder", label: "Borders" },
  { key: "colorAccent", label: "Accent" },
  { key: "colorAccentFg", label: "Accent text" },
  { key: "colorMuted", label: "Muted text" },
];

/*
 * Font stacks that render the SAME in the editor, on the live site, and in an
 * offline export — the last one is the constraint that shapes this list.
 * SiteStyles inlines every byte of CSS with no network (an exported site has to
 * open from file:// with zero requests), so a theme can only name fonts the
 * browser already has. Each stack below resolves to a system font on every OS:
 * no webfont to load, so nothing can silently fall back to something else and
 * make the editor lie about what a visitor will see.
 */
const FONT = {
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  inter: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  trebuchet: "'Trebuchet MS', 'Segoe UI', Tahoma, sans-serif",
  verdana: "Verdana, Geneva, 'Segoe UI', sans-serif",
  tahoma: "Tahoma, 'Segoe UI', Geneva, sans-serif",
  georgia: "Georgia, Cambria, 'Times New Roman', serif",
  palatino: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
  cambria: "Cambria, Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'Courier New', monospace",
} as const;

const FONTS = [
  { label: "System sans", value: FONT.sans },
  { label: "Inter", value: FONT.inter },
  { label: "Trebuchet", value: FONT.trebuchet },
  { label: "Verdana", value: FONT.verdana },
  { label: "Tahoma", value: FONT.tahoma },
  { label: "Georgia", value: FONT.georgia },
  { label: "Palatino", value: FONT.palatino },
  { label: "Cambria", value: FONT.cambria },
  { label: "Mono", value: FONT.mono },
];

/*
 * A "Look" is a whole visual identity in one click: colours, a font pairing and
 * a corner radius together. That is the difference between this and a colour
 * swatch — picking "Bloom" restyles the entire site the way a designer would,
 * not just its accent. Each is a Partial<ThemeTokens>, so applying one is the
 * same patch a person makes by hand and stays fully editable afterwards.
 *
 * The set is deliberately spread: light and dark, serif and sans and mono,
 * sharp corners and soft — so "Surprise me" always lands somewhere different.
 */
type Look = { name: string; tokens: Partial<ThemeTokens> };
const LOOKS: Look[] = [
  {
    name: "Studio", // editorial: white page, ink-blue accent, serif headlines
    tokens: { colorBg: "#ffffff", colorFg: "#14141a", colorSurface: "#f5f5f7", colorBorder: "#e5e5ea", colorAccent: "#1b1b6f", colorAccentFg: "#ffffff", colorMuted: "#6b6b76", fontHeading: FONT.georgia, fontBody: FONT.sans, radius: "10px" },
  },
  {
    name: "Slate", // clean corporate SaaS: cool greys, confident blue
    tokens: { colorBg: "#ffffff", colorFg: "#0f172a", colorSurface: "#f1f5f9", colorBorder: "#e2e8f0", colorAccent: "#2563eb", colorAccentFg: "#ffffff", colorMuted: "#64748b", fontHeading: FONT.sans, fontBody: FONT.sans, radius: "10px" },
  },
  {
    name: "Sand", // warm, classic, unhurried
    tokens: { colorBg: "#faf7f2", colorFg: "#221d16", colorSurface: "#f1ebe1", colorBorder: "#e0d6c7", colorAccent: "#9a5b2c", colorAccentFg: "#ffffff", colorMuted: "#7a6a58", fontHeading: FONT.palatino, fontBody: FONT.georgia, radius: "8px" },
  },
  {
    name: "Forest", // calm, natural, trustworthy green
    tokens: { colorBg: "#ffffff", colorFg: "#10201a", colorSurface: "#eef4f1", colorBorder: "#d6e3dc", colorAccent: "#12734f", colorAccentFg: "#ffffff", colorMuted: "#5d7169", fontHeading: FONT.sans, fontBody: FONT.sans, radius: "12px" },
  },
  {
    name: "Bloom", // friendly and soft: rounded corners, rose accent
    tokens: { colorBg: "#fffafc", colorFg: "#2a1a24", colorSurface: "#fdeef4", colorBorder: "#f6d8e4", colorAccent: "#d6336c", colorAccentFg: "#ffffff", colorMuted: "#8a6b78", fontHeading: FONT.trebuchet, fontBody: FONT.verdana, radius: "22px" },
  },
  {
    name: "Coral", // warm and lively without shouting
    tokens: { colorBg: "#fffdfb", colorFg: "#201812", colorSurface: "#fff2ea", colorBorder: "#ffddc9", colorAccent: "#f2542d", colorAccentFg: "#ffffff", colorMuted: "#7c6a5f", fontHeading: FONT.cambria, fontBody: FONT.sans, radius: "14px" },
  },
  {
    name: "Mono", // brutalist: hard black borders, monospace, no rounding
    tokens: { colorBg: "#ffffff", colorFg: "#0a0a0a", colorSurface: "#f4f4f4", colorBorder: "#111111", colorAccent: "#0a0a0a", colorAccentFg: "#ffffff", colorMuted: "#555555", fontHeading: FONT.mono, fontBody: FONT.mono, radius: "0px" },
  },
  {
    name: "Ink", // dark, modern, violet accent
    tokens: { colorBg: "#0c0c10", colorFg: "#f2f2f5", colorSurface: "#16161c", colorBorder: "#2a2a33", colorAccent: "#6d5cff", colorAccentFg: "#ffffff", colorMuted: "#9a9aad", fontHeading: FONT.inter, fontBody: FONT.inter, radius: "12px" },
  },
  {
    name: "Midnight", // dark and luxe: gold on navy, serif headlines
    tokens: { colorBg: "#0b1220", colorFg: "#eef2f8", colorSurface: "#121a2b", colorBorder: "#24304a", colorAccent: "#d4af37", colorAccentFg: "#10151f", colorMuted: "#8b97ad", fontHeading: FONT.georgia, fontBody: FONT.sans, radius: "6px" },
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
  const [lastLook, setLastLook] = useState(-1);
  const technical = useTechnical();

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

  const applyLook = useCallback(
    (i: number) => {
      setLastLook(i);
      patchTokens(LOOKS[i].tokens);
    },
    [patchTokens],
  );

  // "Surprise me": jump to a random look, but never the one already showing —
  // a restyle that visibly changes nothing reads as broken.
  const surprise = useCallback(() => {
    let i = Math.floor(Math.random() * LOOKS.length);
    if (LOOKS.length > 1 && i === lastLook) i = (i + 1) % LOOKS.length;
    applyLook(i);
  }, [applyLook, lastLook]);

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
      setSaved(technical ? `Saved as theme v${data.versionNo}` : "Design saved");
      setTimeout(() => setSaved(null), 4000);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-800 p-4">
        <p className="display text-[15px] text-ink-100">Site design</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">
          Colours, fonts and shape for every page at once. Change the accent here and every button
          on your site follows.
          {technical && (
            <span className="mt-1 block font-mono text-ink-500">
              Saving appends a new theme revision — versioned on the same terms as pages.
            </span>
          )}
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
              Looks
            </span>
            <button
              type="button"
              onClick={surprise}
              title="Restyle the whole site to a random look"
              className="rounded-md border border-ink-800 bg-ink-950 px-2 py-0.5 text-[10.5px] text-ink-300 transition-colors hover:border-flux-500/50 hover:text-flux-300"
            >
              ✨ Surprise me
            </button>
          </div>
          <p className="mb-2 text-[11px] leading-relaxed text-ink-500">
            One click restyles the whole site — colours, fonts and shape together.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {LOOKS.map((look, i) => {
              const t = look.tokens;
              return (
                <button
                  key={look.name}
                  type="button"
                  onClick={() => applyLook(i)}
                  title={`Restyle everything to “${look.name}”`}
                  className="group overflow-hidden rounded-lg border border-ink-800 bg-ink-950 text-left transition-colors hover:border-flux-500/50"
                >
                  <div className="flex items-center justify-between px-2.5 pt-2">
                    <span className="text-[11.5px] font-medium text-ink-200">{look.name}</span>
                    {/* "Aa" in the look's own heading font + accent — the font pairing,
                        not just the colours, is part of what a click changes. */}
                    <span
                      aria-hidden
                      className="text-[13px] leading-none"
                      style={{ fontFamily: t.fontHeading, color: t.colorAccent }}
                    >
                      Aa
                    </span>
                  </div>
                  <div className="mt-2 flex h-5">
                    {[t.colorBg, t.colorSurface, t.colorAccent, t.colorFg].map((c, j) => (
                      <span key={j} className="flex-1" style={{ background: c }} />
                    ))}
                  </div>
                </button>
              );
            })}
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
          Saved design changes still need a publish to reach your live site.
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
