"use client";

import { useCallback, useRef } from "react";
import { FlowScene, SceneHead } from "./SceneShell";
import { band, clamp01, easeOut, useScrollFrame } from "./scroll";

const RELEASE = "rel_7f3a91c4";

const FILES = ["index.html", "products/index.html", "assets/theme.css", "manifest.json"];

const CARDS = [
  {
    name: "Hosted URL",
    detail: "/s/acme-store",
    body: "The app serves the release's files straight from disk. No render-time database read for the page structure.",
  },
  {
    name: "Static zip",
    detail: "acme-store-rel_7f3a91c4.zip",
    body: "The same files, archived. Opens from file:// with no server and no stylesheet — which is why published components carry inline styles.",
  },
  {
    name: "Container",
    detail: "Dockerfile + nginx.conf",
    body: "The same files plus a web server config. Runs anywhere a container runs, including somewhere we will never see.",
  },
];

/**
 * Beat 08. The artifact assembles, the fan draws, three destinations arrive —
 * and each one is stamped with the same release id, last, so the stamp is the
 * thing you are left looking at. Three writers, one input; they cannot drift.
 */
export default function DestinationsScene() {
  const sectionRef = useRef<HTMLElement | null>(null);

  const fileRefs = useRef<(HTMLLIElement | null)[]>([]);
  const hashRef = useRef<HTMLDivElement | null>(null);
  const trunkRef = useRef<HTMLSpanElement | null>(null);
  const busRef = useRef<HTMLSpanElement | null>(null);
  const dropRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stampRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const footRef = useRef<HTMLParagraphElement | null>(null);

  const draw = useCallback((p: number, reduced: boolean) => {
    const q = reduced ? 1 : band(p, 0.05, 0.95);

    for (let i = 0; i < FILES.length; i++) {
      const el = fileRefs.current[i];
      if (!el) continue;
      const e = easeOut(band(q, 0.03 + i * 0.05, 0.18 + i * 0.05));
      el.style.opacity = String(e);
      el.style.transform = `translate3d(${((1 - e) * -8).toFixed(1)}px,0,0)`;
    }
    if (hashRef.current) {
      const e = easeOut(band(q, 0.24, 0.36));
      hashRef.current.style.opacity = String(e);
    }

    // The split, as an orthogonal bus: trunk down, spread sideways, drop into
    // each destination. Three transforms, no path maths, legible at any width.
    if (trunkRef.current) trunkRef.current.style.transform = `scaleY(${easeOut(band(q, 0.28, 0.38)).toFixed(3)})`;
    if (busRef.current) busRef.current.style.transform = `scaleX(${easeOut(band(q, 0.36, 0.5)).toFixed(3)})`;

    for (let i = 0; i < 3; i++) {
      const from = 0.32 + i * 0.09;
      const drop = dropRefs.current[i];
      if (drop) drop.style.transform = `scaleY(${easeOut(band(q, 0.46 + i * 0.05, 0.62 + i * 0.05)).toFixed(3)})`;
      const card = cardRefs.current[i];
      if (card) {
        const e = easeOut(band(q, from + 0.08, from + 0.3));
        card.style.opacity = String(e);
        card.style.transform = `translate3d(0,${((1 - e) * 22).toFixed(1)}px,0)`;
      }
      const stamp = stampRefs.current[i];
      if (stamp) {
        const e = easeOut(band(q, from + 0.24, from + 0.42));
        stamp.style.opacity = String(e);
        stamp.style.boxShadow = `0 0 ${(Math.sin(clamp01(e) * Math.PI) * 22).toFixed(0)}px rgba(109,92,255,0.5)`;
      }
    }

    if (footRef.current) footRef.current.style.opacity = String(easeOut(band(q, 0.82, 0.96)));
  }, []);

  useScrollFrame(sectionRef, draw);

  return (
    <FlowScene beat="08" innerRef={sectionRef}>
      <SceneHead
        n="08"
        label="destinations"
        therefore={
          <>
            With the boundary drawn, a release id is a complete and safe description of a site&rsquo;s
            appearance — enough to build from, anywhere.
          </>
        }
        title="One build. Three destinations."
      >
        <p>
          The same release id serves a live URL, fills a zip, and populates a container image. Nothing
          is re-derived per target; each writer takes the finished tree and puts it somewhere.
        </p>
      </SceneHead>

      <div className="mt-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="panel p-4">
            <div className="mono-xs flex items-baseline justify-between gap-2 text-ink-500">
              <span className="tracking-[0.16em] uppercase">the artifact</span>
              <span className="text-flux-300">{RELEASE}</span>
            </div>
            <ul className="mt-3 space-y-1">
              {FILES.map((f, i) => (
                <li
                  key={f}
                  ref={(el) => {
                    fileRefs.current[i] = el;
                  }}
                  className="truncate font-mono text-[11px] text-ink-400"
                  style={{ opacity: 0 }}
                >
                  {f}
                </li>
              ))}
            </ul>
            <div
              ref={hashRef}
              className="mono-xs mt-3 border-t border-ink-800 pt-2.5 text-ink-600"
              style={{ opacity: 0 }}
            >
              sha256 · 4f1c…9ab2 · frozen
            </div>
          </div>
        </div>

        <div className="relative h-14 w-full" aria-hidden>
          <span
            ref={trunkRef}
            className="absolute top-0 left-1/2 h-14 w-px origin-top bg-flux-500 md:h-7"
            style={{ transform: "scaleY(0)" }}
          />
          <span
            ref={busRef}
            className="absolute top-7 left-[16.6%] hidden h-px w-[66.8%] origin-center bg-flux-500 md:block"
            style={{ transform: "scaleX(0)" }}
          />
          {["16.6%", "50%", "83.4%"].map((x, i) => (
            <span
              key={x}
              ref={(el) => {
                dropRefs.current[i] = el;
              }}
              className="absolute top-7 hidden h-7 w-px origin-top bg-flux-500 md:block"
              style={{ left: x, transform: "scaleY(0)" }}
            />
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {CARDS.map((c, i) => (
            <div
              key={c.name}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className="panel flex min-w-0 flex-col p-5"
              style={{ opacity: 0 }}
            >
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-flux-500" aria-hidden />
                <h3 className="text-sm font-semibold tracking-tight text-ink-100">{c.name}</h3>
              </div>
              <p className="mono-xs mt-3 truncate text-ink-500">{c.detail}</p>
              <p className="mt-4 flex-1 text-[13px] leading-relaxed text-ink-400">{c.body}</p>
              <span
                ref={(el) => {
                  stampRefs.current[i] = el;
                }}
                className="mono-xs mt-5 self-start rounded border border-flux-500/40 bg-flux-500/10 px-2 py-1 text-flux-300"
                style={{ opacity: 0 }}
              >
                {RELEASE}
              </span>
            </div>
          ))}
        </div>

        <p
          ref={footRef}
          className="mt-6 max-w-2xl text-[13px] leading-relaxed text-ink-500"
          style={{ opacity: 0 }}
        >
          Three writers, one input. If the zip is wrong, the hosted site is wrong too — and a test
          catches it before either ships. The site runs on our servers because that is convenient,
          not because it has to.
        </p>
      </div>
    </FlowScene>
  );
}
