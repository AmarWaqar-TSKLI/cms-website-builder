"use client";

import { useCallback, useRef } from "react";
import { SceneHead } from "./SceneShell";
import { band, clamp01, easeOut, lerp, useScrollFrame } from "./scroll";

/* The stored value, tokenised so each fragment can carry its own colour and
   each *line* can carry the node it belongs to. */
type Tok = readonly [string, string];
const P = "text-ink-600";
const K = "text-flux-300";
const S = "text-live-500";
const N = "text-warn-500";
const T = "text-ink-100";

type Line = { node: number; indent: number; toks: readonly Tok[] };

const LINES: readonly Line[] = [
  { node: 0, indent: 0, toks: [["{", P]] },
  { node: 0, indent: 1, toks: [['"type"', K], [": ", P], ['"Hero"', T], [",", P]] },
  { node: 0, indent: 1, toks: [['"props"', K], [": {", P]] },
  { node: 0, indent: 2, toks: [['"headline"', K], [": ", P], ['"Summer Sale"', S], [",", P]] },
  { node: 0, indent: 2, toks: [['"sub"', K], [": ", P], ['"Ends Sunday"', S]] },
  { node: 0, indent: 1, toks: [["},", P]] },
  { node: 0, indent: 1, toks: [['"children"', K], [": [", P]] },
  { node: 1, indent: 2, toks: [["{ ", P], ['"type"', K], [": ", P], ['"TextBlock"', T], [",", P]] },
  {
    node: 1,
    indent: 3,
    toks: [['"props"', K], [": { ", P], ['"text"', K], [": ", P], ['"Everything must go."', S], [" } },", P]],
  },
  { node: 2, indent: 2, toks: [["{ ", P], ['"type"', K], [": ", P], ['"ProductGrid"', T], [",", P]] },
  {
    node: 2,
    indent: 3,
    toks: [['"props"', K], [": { ", P], ['"count"', K], [": ", P], ["3", N], [" } },", P]],
  },
  { node: 3, indent: 2, toks: [["{ ", P], ['"type"', K], [": ", P], ['"Button"', T], [",", P]] },
  {
    node: 3,
    indent: 3,
    toks: [['"props"', K], [": { ", P], ['"label"', K], [": ", P], ['"Shop now"', S], [" } }", P]],
  },
  { node: 3, indent: 1, toks: [["]", P]] },
  { node: 3, indent: 0, toks: [["}", P]] },
];

const REGISTRY = [
  { name: '"Hero"', comp: "Hero" },
  { name: '"TextBlock"', comp: "TextBlock" },
  { name: '"ProductGrid"', comp: "ProductGrid" },
  { name: '"Button"', comp: "Button" },
];

const ROW_H = 46;

/**
 * Beat 04, the thesis. On the left is the literal column value; on the right is
 * what a visitor sees; between them is the registry, which is the only place
 * the two are joined. Scrolling walks the tree: each node lights in the JSON,
 * resolves through the registry, and materialises as rendered UI. Nothing that
 * has already rendered moves when the next node arrives.
 */
export default function DescriptionScene() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const regRefs = useRef<(HTMLDivElement | null)[]>([]);
  const regNames = useRef<(HTMLSpanElement | null)[]>([]);
  const beamRef = useRef<HTMLDivElement | null>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const counterRef = useRef<HTMLSpanElement | null>(null);

  const draw = useCallback((p: number, reduced: boolean) => {
    const q = reduced ? 1 : band(p, 0.05, 0.9);
    const t: number[] = [];
    for (let i = 0; i < 4; i++) t.push(band(q, i * 0.19, i * 0.19 + 0.3));

    for (let i = 0; i < LINES.length; i++) {
      const el = lineRefs.current[i];
      if (!el) continue;
      const v = t[LINES[i].node];
      const e = easeOut(v);
      el.style.opacity = String(0.14 + 0.86 * e);
      el.style.backgroundColor = `rgba(109,92,255,${(Math.sin(clamp01(v) * Math.PI) * 0.14).toFixed(3)})`;
      el.style.borderLeftColor = `rgba(109,92,255,${(e * 0.9).toFixed(3)})`;
    }

    for (let i = 0; i < REGISTRY.length; i++) {
      const el = regRefs.current[i];
      if (el) el.style.opacity = String(0.16 + 0.84 * easeOut(t[i]));
      const nm = regNames.current[i];
      if (nm) nm.style.color = t[i] > 0.9 ? "#a89dff" : "#454553";
    }

    // The beam sits on whichever registry row is currently resolving.
    let pos = -1;
    for (let i = 0; i < 4; i++) pos += clamp01(t[i]);
    if (beamRef.current) {
      const y = Math.max(0, Math.min(3, pos)) * ROW_H;
      beamRef.current.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
      beamRef.current.style.opacity = String(clamp01(t[0] * 3));
    }

    for (let i = 0; i < 4; i++) {
      const el = blockRefs.current[i];
      if (!el) continue;
      const e = easeOut(t[i]);
      el.style.opacity = String(e);
      el.style.transform = `translate3d(0,${((1 - e) * 14).toFixed(2)}px,0) scale(${lerp(0.965, 1, e).toFixed(4)})`;
      el.style.filter = e > 0.99 ? "none" : `blur(${((1 - e) * 3).toFixed(2)}px)`;
    }

    if (counterRef.current) {
      const done = t.filter((v) => v > 0.9).length;
      const text = `${done} / 4 nodes resolved`;
      if (counterRef.current.textContent !== text) counterRef.current.textContent = text;
    }
  }, []);

  useScrollFrame(sectionRef, draw, "auto");

  return (
    <section ref={sectionRef} data-beat="04" className="relative h-auto lg:h-[162vh]">
      <div className="relative lg:sticky lg:top-0 lg:flex lg:h-screen lg:items-center lg:overflow-hidden">
        <div className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-14 lg:py-6">
          <SceneHead
            tight
            n="04"
            label="the model"
            therefore={<>A neutral source that compiles is not markup. It is a description of what the page is.</>}
            title={
              <>
                Store a description.
                <br className="hidden sm:block" /> Never store HTML.
              </>
            }
          >
            <p>
              A page is a tree of{" "}
              <code className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-[0.85em] text-ink-200">
                {"{ type, props, children }"}
              </code>
              . The database holds names and values. The components those names refer to live in the
              codebase — versioned, typed and tested like any other code. A registry joins the two,
              and it is the reason the same tree renders into the editor, a hosted route, and a file
              that opens from a USB stick.
            </p>
          </SceneHead>

          <div className="mt-8 grid gap-3 lg:grid-cols-[minmax(0,1fr)_154px_minmax(0,1.06fr)] lg:gap-4">
            {/* the stored value */}
            <div className="panel flex min-w-0 flex-col p-4">
              <div className="mono-xs flex items-baseline justify-between gap-2 text-ink-500">
                <span className="tracking-[0.16em] uppercase">the database</span>
                <span className="text-ink-600">pages.draft_json</span>
              </div>
              <div className="mt-3 min-w-0 overflow-x-auto">
                <div className="min-w-max font-mono text-[10.5px] leading-[1.75] sm:text-[11.5px]">
                  {LINES.map((l, i) => (
                    <div
                      key={i}
                      ref={(el) => {
                        lineRefs.current[i] = el;
                      }}
                      className="border-l-2 pr-2 pl-2"
                      style={{
                        opacity: 0.14,
                        borderLeftColor: "rgba(109,92,255,0)",
                        paddingLeft: 8 + l.indent * 12,
                      }}
                    >
                      {l.toks.map(([text, cls], j) => (
                        <span key={j} className={cls}>
                          {text}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* the join */}
            <div className="panel relative flex min-w-0 flex-col p-4">
              <div className="mono-xs text-ink-500">
                <span className="tracking-[0.16em] uppercase">registry</span>
              </div>
              <div className="relative mt-3">
                <div
                  ref={beamRef}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 rounded-md border border-flux-500/40 bg-flux-500/10"
                  style={{ height: ROW_H - 6, opacity: 0 }}
                />
                {REGISTRY.map((r, i) => (
                  <div
                    key={r.comp}
                    ref={(el) => {
                      regRefs.current[i] = el;
                    }}
                    className="relative flex flex-col justify-center px-2 font-mono text-[10.5px] leading-tight"
                    style={{ height: ROW_H, opacity: 0.16 }}
                  >
                    <span className="truncate text-live-500">{r.name}</span>
                    <span className="mt-1 truncate text-ink-500">
                      <span className="text-ink-600">→ </span>
                      <span
                        ref={(el) => {
                          regNames.current[i] = el;
                        }}
                        style={{ color: "#454553" }}
                      >
                        {`<${r.comp}/>`}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mono-xs mt-3 leading-relaxed text-ink-600">one table, three consumers</p>
            </div>

            {/* what a visitor gets */}
            <div className="panel flex min-w-0 flex-col p-4">
              <div className="mono-xs flex items-baseline justify-between gap-2 text-ink-500">
                <span className="tracking-[0.16em] uppercase">rendered</span>
                <span ref={counterRef} className="text-ink-600">
                  0 / 4 nodes resolved
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-2.5 rounded-lg border border-ink-800 bg-ink-950 p-3">
                <div
                  ref={(el) => {
                    blockRefs.current[0] = el;
                  }}
                  className="flex h-[86px] flex-col justify-center rounded-md border border-flux-500/25 bg-gradient-to-br from-flux-500/20 to-ink-900 px-4"
                  style={{ opacity: 0 }}
                >
                  <div className="text-[19px] leading-tight font-semibold tracking-tight text-ink-100">
                    Summer Sale
                  </div>
                  <div className="mt-1 text-[11px] text-ink-300">Ends Sunday</div>
                </div>

                <div
                  ref={(el) => {
                    blockRefs.current[1] = el;
                  }}
                  className="h-[52px] rounded-md border border-ink-800 px-4 py-2.5"
                  style={{ opacity: 0 }}
                >
                  <div className="text-[12px] text-ink-200">Everything must go.</div>
                  <div className="mt-2 h-1 w-3/4 rounded-full bg-ink-800" />
                </div>

                <div
                  ref={(el) => {
                    blockRefs.current[2] = el;
                  }}
                  className="grid h-[84px] grid-cols-3 gap-2"
                  style={{ opacity: 0 }}
                >
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="rounded-md border border-ink-800 bg-ink-900 p-2">
                      <div className="h-[36px] rounded bg-ink-800" />
                      <div className="mono-xs mt-2 text-ink-500">£{[24, 38, 19][i]}.00</div>
                    </div>
                  ))}
                </div>

                <div
                  ref={(el) => {
                    blockRefs.current[3] = el;
                  }}
                  className="flex h-[38px] items-center"
                  style={{ opacity: 0 }}
                >
                  <span className="rounded-md bg-flux-500 px-4 py-2 text-[12px] font-semibold text-white">
                    Shop now
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
