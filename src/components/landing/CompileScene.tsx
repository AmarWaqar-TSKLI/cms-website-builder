"use client";

import { useCallback, useRef } from "react";
import { Diagram, FlowScene, SceneHead } from "./SceneShell";
import { C, band, clamp01, mix, useScrollFrame } from "./scroll";

const TARGETS = [
  { y: 22, name: "hosted site", note: "/s/acme-store" },
  { y: 118, name: "static zip", note: "opens from file://" },
  { y: 214, name: "container", note: "Dockerfile + nginx" },
];

/**
 * Beat 03. One source, one read, three writers. The fan is drawn rather than
 * described: a packet leaves the description, passes the build worker once, and
 * splits. Nothing is re-derived per target — the same finished tree is handed
 * to three writers that only differ in where they put bytes.
 */
export default function CompileScene() {
  const sectionRef = useRef<HTMLElement | null>(null);

  const sourceRef = useRef<SVGGElement | null>(null);
  const feedRef = useRef<SVGPathElement | null>(null);
  const feedDot = useRef<SVGCircleElement | null>(null);
  const workerRef = useRef<SVGGElement | null>(null);
  const workerBox = useRef<SVGRectElement | null>(null);
  const fanRefs = useRef<(SVGPathElement | null)[]>([]);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const targetRefs = useRef<(SVGGElement | null)[]>([]);
  const targetBoxes = useRef<(SVGRectElement | null)[]>([]);

  const draw = useCallback((p: number, reduced: boolean) => {
    const q = reduced ? 1 : band(p, 0.05, 0.95);

    const tSrc = band(q, 0.02, 0.18);
    if (sourceRef.current) sourceRef.current.style.opacity = String(0.1 + 0.9 * tSrc);

    const tFeed = band(q, 0.12, 0.34);
    if (feedRef.current) {
      const len = feedRef.current.getTotalLength();
      feedRef.current.style.strokeDasharray = `${len}`;
      feedRef.current.style.strokeDashoffset = `${len * (1 - tFeed)}`;
      if (feedDot.current) {
        const pt = feedRef.current.getPointAtLength(len * tFeed);
        feedDot.current.setAttribute("cx", pt.x.toFixed(1));
        feedDot.current.setAttribute("cy", pt.y.toFixed(1));
        feedDot.current.style.opacity = String(tFeed > 0.02 && tFeed < 0.995 ? 1 : 0);
      }
    }

    const tWork = band(q, 0.26, 0.42);
    if (workerRef.current) workerRef.current.style.opacity = String(0.1 + 0.9 * tWork);
    if (workerBox.current) workerBox.current.setAttribute("stroke", mix(C.ink700, C.flux500, tWork));

    for (let i = 0; i < TARGETS.length; i++) {
      const from = 0.36 + i * 0.13;
      const t = band(q, from, from + 0.26);
      const path = fanRefs.current[i];
      if (path) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = `${len}`;
        path.style.strokeDashoffset = `${len * (1 - t)}`;
        path.setAttribute("stroke", mix(C.ink600, C.flux500, t));
        path.style.opacity = String(0.3 + 0.7 * t);
        const dot = dotRefs.current[i];
        if (dot) {
          const pt = path.getPointAtLength(len * t);
          dot.setAttribute("cx", pt.x.toFixed(1));
          dot.setAttribute("cy", pt.y.toFixed(1));
          dot.style.opacity = String(t > 0.02 && t < 0.995 ? 1 : 0);
        }
      }
      const arrived = band(t, 0.84, 1);
      const g = targetRefs.current[i];
      if (g) {
        g.style.opacity = String(0.12 + 0.88 * clamp01(t * 1.15));
        g.style.transform = `translate3d(${((1 - t) * 10).toFixed(1)}px,0,0)`;
      }
      const box = targetBoxes.current[i];
      if (box) {
        box.setAttribute("stroke", mix(C.ink700, C.flux400, arrived));
        box.setAttribute("fill", arrived > 0.5 ? "rgba(109,92,255,0.07)" : C.ink900);
      }
    }
  }, []);

  useScrollFrame(sectionRef, draw);

  return (
    <FlowScene beat="03" innerRef={sectionRef}>
      <SceneHead
        n="03"
        label="compilation"
        therefore={
          <>
            And if one publish must become a hosted site, a zip and a container, the thing being
            published cannot be shaped like any one of them.
          </>
        }
        title="One source. Several targets."
      >
        <p>
          The stored form has to be neutral — closer to an AST than to a document. Then publishing is
          compilation: read the source once, emit each target from it.
        </p>
        <p>
          If the source were HTML it would already have chosen a target. It would carry class names
          for a stylesheet the zip does not have, and absolute URLs the container will never resolve.
        </p>
      </SceneHead>

      <Diagram className="mt-10" minWidth={680}>
        <svg viewBox="0 0 820 292" className="h-auto w-full" role="img" aria-hidden>
          <path
            ref={feedRef}
            d="M 214 146 L 330 146"
            fill="none"
            stroke={C.flux500}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <circle ref={feedDot} r={4} fill={C.flux300} style={{ opacity: 0 }} />

          {TARGETS.map((t, i) => (
            <path
              key={t.name}
              ref={(el) => {
                fanRefs.current[i] = el;
              }}
              d={`M 490 146 C 560 146, 570 ${t.y + 32}, 646 ${t.y + 32}`}
              fill="none"
              stroke={C.ink600}
              strokeWidth={1.4}
              strokeLinecap="round"
              style={{ opacity: 0.3 }}
            />
          ))}
          {TARGETS.map((t, i) => (
            <circle
              key={t.name}
              ref={(el) => {
                dotRefs.current[i] = el;
              }}
              r={4}
              fill={C.flux300}
              style={{ opacity: 0 }}
            />
          ))}

          <g ref={sourceRef} style={{ opacity: 0.1 }}>
            <rect x={16} y={110} width={198} height={72} rx={11} fill={C.ink900} stroke={C.ink700} />
            <text x={36} y={140} className="font-sans" fontSize={14} fill={C.ink100} fontWeight={600}>
              description
            </text>
            <text x={36} y={162} className="font-mono" fontSize={10.5} fill={C.ink400}>
              {"{ type, props, children }"}
            </text>
          </g>

          <g ref={workerRef} style={{ opacity: 0.1 }}>
            <rect ref={workerBox} x={330} y={108} width={160} height={76} rx={11} fill={C.ink900} stroke={C.ink700} />
            <text x={410} y={138} textAnchor="middle" className="font-sans" fontSize={13.5} fill={C.ink100}>
              build worker
            </text>
            <text x={410} y={158} textAnchor="middle" className="font-mono" fontSize={10} fill={C.ink400}>
              resolve → render → write
            </text>
            <text x={410} y={175} textAnchor="middle" className="font-mono" fontSize={9.5} fill={C.ink500}>
              reads the source once
            </text>
          </g>

          {TARGETS.map((t, i) => (
            <g
              key={t.name}
              ref={(el) => {
                targetRefs.current[i] = el;
              }}
              style={{ opacity: 0.12 }}
            >
              <rect
                ref={(el) => {
                  targetBoxes.current[i] = el;
                }}
                x={646}
                y={t.y}
                width={158}
                height={64}
                rx={11}
                fill={C.ink900}
                stroke={C.ink700}
              />
              <text x={666} y={t.y + 27} className="font-sans" fontSize={13} fill={C.ink100}>
                {t.name}
              </text>
              <text x={666} y={t.y + 46} className="font-mono" fontSize={10} fill={C.ink400}>
                {t.note}
              </text>
            </g>
          ))}
        </svg>
      </Diagram>
    </FlowScene>
  );
}
