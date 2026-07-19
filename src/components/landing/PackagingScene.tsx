"use client";

import { useCallback, useRef } from "react";
import { Diagram, FlowScene, SceneHead } from "./SceneShell";
import { C, band, clamp01, easeOut, mix, useScrollFrame } from "./scroll";

const FILES = ["index.html", "products/index.html", "assets/theme.css", "manifest.json"];

/**
 * Beat 02. Two lanes leaving the same server. The flag is the only thing on the
 * top lane and it does not survive the trip — outside the process that reads
 * it, `is_published = true` is not information. The package on the bottom lane
 * arrives intact, because it never needed anything it left behind.
 */
export default function PackagingScene() {
  const sectionRef = useRef<HTMLElement | null>(null);

  const flagRef = useRef<SVGGElement | null>(null);
  const flagBox = useRef<SVGRectElement | null>(null);
  const flagText = useRef<SVGTextElement | null>(null);
  const deadRef = useRef<SVGGElement | null>(null);

  const pkgRef = useRef<SVGGElement | null>(null);
  const pkgBox = useRef<SVGRectElement | null>(null);
  const fileRefs = useRef<(SVGTextElement | null)[]>([]);
  const railRef = useRef<SVGPathElement | null>(null);
  const landedRef = useRef<SVGGElement | null>(null);
  const landedBox = useRef<SVGRectElement | null>(null);

  const draw = useCallback((p: number, reduced: boolean) => {
    const q = reduced ? 1 : band(p, 0.05, 0.95);

    /* lane A — the flag leaves and stops meaning anything */
    const tA = band(q, 0.04, 0.58);
    const decay = band(tA, 0.3, 0.86);
    const x = easeOut(tA) * 318;
    if (flagRef.current) {
      flagRef.current.setAttribute("transform", `translate(${x.toFixed(1)} 0)`);
      flagRef.current.style.opacity = String(clamp01(1 - decay * 1.02));
    }
    if (flagBox.current) {
      const w = 176 * (1 - 0.42 * decay);
      const h = 40 * (1 - 0.5 * decay);
      flagBox.current.setAttribute("x", (250 - w / 2).toFixed(1));
      flagBox.current.setAttribute("width", w.toFixed(1));
      flagBox.current.setAttribute("y", (130 - h / 2).toFixed(1));
      flagBox.current.setAttribute("height", h.toFixed(1));
      flagBox.current.setAttribute("stroke", mix(C.ink600, C.fail, decay));
      flagBox.current.style.strokeDasharray = `${(9 * (1 - decay)).toFixed(1)} ${(1 + 11 * decay).toFixed(1)}`;
    }
    if (flagText.current) flagText.current.style.opacity = String(clamp01(1 - decay * 1.6));
    if (deadRef.current) deadRef.current.style.opacity = String(band(tA, 0.72, 1));

    /* lane B — the package travels whole */
    const tB = band(q, 0.26, 0.94);
    if (railRef.current) {
      const len = railRef.current.getTotalLength();
      railRef.current.style.strokeDasharray = `${len}`;
      railRef.current.style.strokeDashoffset = `${len * (1 - tB)}`;
    }
    if (pkgRef.current) pkgRef.current.setAttribute("transform", `translate(${(easeOut(tB) * 300).toFixed(1)} 0)`);
    if (pkgBox.current) {
      pkgBox.current.setAttribute("stroke", mix(C.flux500, C.live, band(tB, 0.85, 1)));
    }
    for (let i = 0; i < FILES.length; i++) {
      const el = fileRefs.current[i];
      if (el) el.style.opacity = String(0.15 + 0.85 * band(q, 0.06 + i * 0.05, 0.24 + i * 0.05));
    }
    const landed = band(tB, 0.82, 1);
    if (landedRef.current) landedRef.current.style.opacity = String(landed);
    if (landedBox.current) landedBox.current.setAttribute("stroke", mix(C.ink700, C.live, landed));
  }, []);

  useScrollFrame(sectionRef, draw);

  return (
    <FlowScene beat="02" innerRef={sectionRef}>
      <SceneHead
        n="02"
        label="publish"
        therefore={
          <>If the output has to run elsewhere, publishing cannot be a state change in our database.</>
        }
        title="Publish produces a package, not a flag."
      >
        <p>
          <code className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-[0.85em] text-ink-200">
            is_published = true
          </code>{" "}
          creates nothing. It marks a row and leaves the site dependent on the process that reads
          that row. Take the row somewhere else and you are holding a boolean.
        </p>
        <p>
          A release is a real thing: rendered files, a manifest, a content hash, an immutable id. It
          was correct the moment it was written and it stays correct, because nothing about it is
          recomputed later.
        </p>
      </SceneHead>

      <Diagram className="mt-10" minWidth={680}>
        <svg viewBox="0 0 820 316" className="h-auto w-full" role="img" aria-hidden>
          <rect x={20} y={56} width={130} height={218} rx={12} fill={C.ink900} stroke={C.ink700} />
          <text x={85} y={152} textAnchor="middle" className="font-sans" fontSize={13} fill={C.ink200}>
            our server
          </text>
          <text x={85} y={171} textAnchor="middle" className="font-mono" fontSize={10} fill={C.ink500}>
            the boundary
          </text>

          <text x={162} y={82} className="font-mono" fontSize={10} fill={C.ink500} letterSpacing="0.16em">
            A FLAG
          </text>
          <line x1={162} y1={130} x2={652} y2={130} stroke={C.ink700} strokeDasharray="3 6" />

          <g ref={flagRef}>
            <rect
              ref={flagBox}
              x={162}
              y={110}
              width={176}
              height={40}
              rx={8}
              fill={C.ink850}
              stroke={C.ink600}
            />
            <text
              ref={flagText}
              x={250}
              y={135}
              textAnchor="middle"
              className="font-mono"
              fontSize={12}
              fill={C.ink200}
            >
              is_published = true
            </text>
          </g>

          <rect
            x={660}
            y={104}
            width={142}
            height={52}
            rx={10}
            fill="none"
            stroke={C.ink700}
            strokeDasharray="4 5"
          />
          <g ref={deadRef} style={{ opacity: 0 }}>
            <text x={731} y={128} textAnchor="middle" className="font-mono" fontSize={11.5} fill={C.fail}>
              nothing arrived
            </text>
            <text x={731} y={145} textAnchor="middle" className="font-mono" fontSize={10} fill={C.ink500}>
              no reader, no meaning
            </text>
          </g>

          <text x={162} y={192} className="font-mono" fontSize={10} fill={C.ink500} letterSpacing="0.16em">
            A PACKAGE
          </text>
          <path
            ref={railRef}
            d="M 162 246 L 652 246"
            fill="none"
            stroke={C.flux500}
            strokeWidth={1}
            opacity={0.5}
          />

          <g ref={pkgRef}>
            <rect
              ref={pkgBox}
              x={162}
              y={202}
              width={190}
              height={88}
              rx={9}
              fill={C.ink900}
              stroke={C.flux500}
            />
            <text x={176} y={221} className="font-mono" fontSize={11} fill={C.flux300}>
              rel_7f3a91c4
            </text>
            <line x1={176} y1={229} x2={338} y2={229} stroke={C.ink700} />
            {FILES.map((f, i) => (
              <text
                key={f}
                ref={(el) => {
                  fileRefs.current[i] = el;
                }}
                x={176}
                y={243 + i * 13}
                className="font-mono"
                fontSize={9.5}
                fill={C.ink400}
                style={{ opacity: 0.15 }}
              >
                {f}
              </text>
            ))}
          </g>

          <rect
            ref={landedBox}
            x={660}
            y={202}
            width={142}
            height={88}
            rx={10}
            fill="none"
            stroke={C.ink700}
          />
          <g ref={landedRef} style={{ opacity: 0 }}>
            <text x={731} y={234} textAnchor="middle" className="font-sans" fontSize={13} fill={C.ink100}>
              it runs
            </text>
            <text x={731} y={253} textAnchor="middle" className="font-mono" fontSize={10} fill={C.live}>
              no database
            </text>
            <text x={731} y={269} textAnchor="middle" className="font-mono" fontSize={10} fill={C.ink500}>
              byte-identical
            </text>
          </g>

          <text x={731} y={84} textAnchor="middle" className="font-mono" fontSize={10} fill={C.ink500} letterSpacing="0.16em">
            ANYWHERE ELSE
          </text>
        </svg>
      </Diagram>
    </FlowScene>
  );
}
