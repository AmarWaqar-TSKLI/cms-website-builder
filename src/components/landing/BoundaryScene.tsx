"use client";

import { useCallback, useRef } from "react";
import { FlowScene, SceneHead } from "./SceneShell";
import { band, clamp01, easeOut, useScrollFrame } from "./scroll";

const VERSIONED = [
  "page_revisions · headline edited",
  "theme_revisions · accent changed",
  "page_revisions · block reordered",
  "releases · rel_7f3a91c4 built",
  "page_revisions · typo introduced",
  "releases · rel_9d4c02f1 built",
];

const LIVE = [
  "orders · #4417 paid",
  "products · stock 12 → 11",
  "orders · #4418 paid",
  "customers · 1 created",
  "orders · #4419 paid",
  "order_line_items · 3 written",
];

const ROLLBACK_FROM = 0.56;
const ROLLBACK_TO = 0.7;

/**
 * Beat 07. The same scroll drives two clocks. The versioned side runs forward
 * and then *rewinds* two rows when the rollback lands — the rows are still
 * there, they are simply no longer pointed at. The live side does not notice:
 * its counter keeps climbing straight through the rollback and past it. One
 * column crosses between them, and it is the only one that is allowed to.
 */
export default function BoundaryScene() {
  const sectionRef = useRef<HTMLElement | null>(null);

  const verRows = useRef<(HTMLLIElement | null)[]>([]);
  const liveRows = useRef<(HTMLLIElement | null)[]>([]);
  const revNum = useRef<HTMLSpanElement | null>(null);
  const revNote = useRef<HTMLSpanElement | null>(null);
  const orderNum = useRef<HTMLSpanElement | null>(null);
  const chipRef = useRef<HTMLSpanElement | null>(null);
  const chipVal = useRef<HTMLSpanElement | null>(null);
  const pulseRef = useRef<HTMLSpanElement | null>(null);
  const markerRef = useRef<HTMLSpanElement | null>(null);

  const draw = useCallback((p: number, reduced: boolean) => {
    const q = reduced ? 1 : band(p, 0.05, 0.95);
    const back = band(q, ROLLBACK_FROM, ROLLBACK_TO);

    /* versioned: appends, then the pointer walks back two rows */
    for (let i = 0; i < VERSIONED.length; i++) {
      const el = verRows.current[i];
      if (!el) continue;
      const t = band(q, 0.04 + i * 0.07, 0.2 + i * 0.07);
      const e = easeOut(t);
      // The two newest rows dim on rollback — dimmed, never removed.
      const orphan = i >= VERSIONED.length - 2 ? back : 0;
      el.style.opacity = String(e * (1 - 0.62 * orphan));
      el.style.transform = `translate3d(${((1 - e) * -10).toFixed(1)}px,0,0)`;
      el.style.textDecoration = orphan > 0.6 ? "line-through" : "none";
      el.style.textDecorationColor = "rgba(242,85,90,0.55)";
    }
    if (markerRef.current) {
      const idx = VERSIONED.length - 1 - back * 2;
      markerRef.current.style.transform = `translate3d(0,${(idx * 28).toFixed(1)}px,0)`;
      markerRef.current.style.opacity = String(clamp01(band(q, 0.34, 0.46)));
    }

    const revUp = 138 + Math.round(band(q, 0.04, 0.5) * 9);
    const shown = revUp - Math.round(back * 5);
    if (revNum.current) {
      const s = String(shown).padStart(4, "0");
      if (revNum.current.textContent !== s) revNum.current.textContent = s;
      revNum.current.style.color = back > 0.05 ? "#f2555a" : "#e8e8ef";
    }
    if (revNote.current) {
      const s = back > 0.05 ? "rewound · nothing deleted" : "moving forward";
      if (revNote.current.textContent !== s) revNote.current.textContent = s;
    }

    /* live: monotonic, and it does not stop during the rollback */
    for (let i = 0; i < LIVE.length; i++) {
      const el = liveRows.current[i];
      if (!el) continue;
      const t = band(q, 0.04 + i * 0.14, 0.18 + i * 0.14);
      const e = easeOut(t);
      el.style.opacity = String(e);
      el.style.transform = `translate3d(${((1 - e) * 10).toFixed(1)}px,0,0)`;
    }
    if (orderNum.current) {
      const s = (8412 + Math.round(easeOut(q) * 57)).toLocaleString("en-GB");
      if (orderNum.current.textContent !== s) orderNum.current.textContent = s;
    }

    /* the one column that crosses */
    const flash = Math.sin(clamp01(back) * Math.PI);
    if (chipRef.current) {
      chipRef.current.style.borderColor = back > 0.5 ? "rgba(109,92,255,0.85)" : "rgba(33,33,41,1)";
      chipRef.current.style.boxShadow = `0 0 ${(flash * 26).toFixed(0)}px rgba(109,92,255,${(flash * 0.55).toFixed(2)})`;
    }
    if (chipVal.current) {
      const s = back > 0.5 ? "rel_7f3a91c4" : "rel_9d4c02f1";
      if (chipVal.current.textContent !== s) chipVal.current.textContent = s;
      chipVal.current.style.color = back > 0.5 ? "#a89dff" : "#9a9aad";
    }
    if (pulseRef.current) pulseRef.current.style.opacity = String(flash);
  }, []);

  useScrollFrame(sectionRef, draw);

  return (
    <FlowScene beat="07" innerRef={sectionRef}>
      <SceneHead
        n="07"
        label="the boundary"
        therefore={
          <>
            But an order is not a headline. Rolling everything back would undo things that were never
            anyone&rsquo;s mistake.
          </>
        }
        title="Two clocks in one database."
      >
        <p>
          Appearance is versioned: pages, themes, releases and their revisions all move backwards on
          command. Business data is not. Roll back a headline and you have fixed a mistake; roll back
          an order and you have destroyed a fact. So they are kept on separate clocks, and exactly
          one column is allowed to cross.
        </p>
      </SceneHead>

      <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px_minmax(0,1fr)] lg:items-stretch">
        {/* versioned */}
        <div className="panel min-w-0 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold tracking-tight text-ink-100">Versioned appearance</h3>
            <span className="mono-xs text-flux-400">rolls back</span>
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <span ref={revNum} className="font-mono text-[30px] leading-none text-ink-100">
              0138
            </span>
            <span ref={revNote} className="mono-xs text-ink-500">
              moving forward
            </span>
          </div>
          <div className="relative mt-5">
            <span
              ref={markerRef}
              aria-hidden
              className="absolute top-0 -left-1 h-[24px] w-[3px] rounded-full bg-flux-500"
              style={{ opacity: 0 }}
            />
            <ul className="space-y-0 pl-3">
              {VERSIONED.map((row, i) => (
                <li
                  key={row}
                  ref={(el) => {
                    verRows.current[i] = el;
                  }}
                  className="flex h-[28px] items-center truncate font-mono text-[11px] text-ink-300"
                  style={{ opacity: 0 }}
                >
                  {row}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* the crossing */}
        <div className="flex min-w-0 flex-row items-center justify-center gap-3 py-1 lg:flex-col lg:py-0">
          <span className="relative h-px flex-1 bg-gradient-to-r from-transparent via-ink-700 to-transparent lg:h-full lg:w-px lg:bg-gradient-to-b">
            <span
              ref={pulseRef}
              aria-hidden
              className="absolute inset-0 bg-gradient-to-r from-transparent via-flux-400 to-transparent lg:bg-gradient-to-b"
              style={{ opacity: 0 }}
            />
          </span>
          <span
            ref={chipRef}
            className="mono-xs shrink-0 rounded-full border border-ink-700 bg-ink-900 px-3 py-2 text-center whitespace-nowrap text-ink-300"
          >
            sites.live_release_id
            <br />
            <span ref={chipVal} className="text-ink-300">
              rel_9d4c02f1
            </span>
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-ink-700 to-transparent lg:h-full lg:w-px lg:bg-gradient-to-b" />
        </div>

        {/* live */}
        <div className="panel min-w-0 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold tracking-tight text-ink-100">Live business data</h3>
            <span className="mono-xs text-live-500">never rolls back</span>
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <span ref={orderNum} className="font-mono text-[30px] leading-none text-live-500">
              8,412
            </span>
            <span className="mono-xs text-ink-500">orders · monotonic</span>
          </div>
          <ul className="mt-5 space-y-0 pl-3">
            {LIVE.map((row, i) => (
              <li
                key={row}
                ref={(el) => {
                  liveRows.current[i] = el;
                }}
                className="flex h-[28px] items-center truncate font-mono text-[11px] text-ink-300"
                style={{ opacity: 0 }}
              >
                {row}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </FlowScene>
  );
}
