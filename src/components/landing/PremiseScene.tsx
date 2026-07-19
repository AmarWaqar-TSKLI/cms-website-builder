"use client";

import { useCallback, useRef } from "react";
import { Diagram, FlowScene, SceneHead } from "./SceneShell";
import { C, arc, band, clamp01, easeOut, mix, useScrollFrame } from "./scroll";

const SLABS = [
  { y: 40, label: "our renderer", note: "turns rows into HTML" },
  { y: 116, label: "our database", note: "holds the only copy" },
  { y: 192, label: "our runtime", note: "resolves every URL" },
];

const CARD_RIGHT = 392;
const CARD_MID = 152;
const SLAB_X = 566;
const PULL = 40;

/**
 * Beat 01. The site is tethered to three things it does not own. Scrolling
 * pulls it toward "anywhere else"; the tethers go taut, turn red, and it snaps
 * back. Nothing is broken — that *is* the architecture, and it is the thing
 * every later decision refuses.
 */
export default function PremiseScene() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<SVGGElement | null>(null);
  const ghostRef = useRef<SVGGElement | null>(null);
  const verdictRef = useRef<SVGGElement | null>(null);
  const tethers = useRef<(SVGPathElement | null)[]>([]);
  const slabRefs = useRef<(SVGGElement | null)[]>([]);
  const slabPlates = useRef<(SVGRectElement | null)[]>([]);

  const draw = useCallback((p: number, reduced: boolean) => {
    const q = band(p, 0.06, 0.94);
    const strain = reduced ? 1 : arc(band(q, 0.46, 1));
    const dx = -PULL * easeOut(strain);

    cardRef.current?.setAttribute("transform", `translate(${dx.toFixed(2)} 0)`);

    for (let i = 0; i < SLABS.length; i++) {
      const t = band(q, 0.04 + i * 0.12, 0.4 + i * 0.12);
      const slab = slabRefs.current[i];
      if (slab) slab.style.opacity = String(0.12 + 0.88 * easeOut(t));

      const plate = slabPlates.current[i];
      if (plate) plate.setAttribute("stroke", mix(C.ink700, C.fail, strain * 0.55));

      const path = tethers.current[i];
      if (!path) continue;
      const sy = CARD_MID + (i - 1) * 16;
      const ty = SLABS[i].y + 28;
      const sx = CARD_RIGHT + dx;
      path.setAttribute(
        "d",
        `M ${sx.toFixed(1)} ${sy} C ${(sx + 78).toFixed(1)} ${sy}, ${SLAB_X - 78} ${ty}, ${SLAB_X} ${ty}`,
      );
      const len = path.getTotalLength();
      path.style.strokeDasharray = `${len}`;
      path.style.strokeDashoffset = `${len * (1 - clamp01(t))}`;
      path.setAttribute("stroke", mix(C.ink600, C.fail, strain * 0.92));
      path.setAttribute("stroke-width", (1.25 + strain * 0.85).toFixed(2));
      path.style.opacity = String(0.35 + 0.65 * t);
    }

    if (ghostRef.current) ghostRef.current.style.opacity = String(0.28 + 0.62 * strain);
    if (verdictRef.current) verdictRef.current.style.opacity = String(clamp01(strain * 1.35 - 0.15));
  }, []);

  useScrollFrame(sectionRef, draw);

  return (
    <FlowScene beat="01" innerRef={sectionRef}>
      <SceneHead
        n="01"
        label="the premise"
        title={
          <>
            A site should not be trapped
            <br className="hidden sm:block" /> on the server that built it.
          </>
        }
      >
        <p>
          Most platforms answer &ldquo;where does your site live?&rdquo; with{" "}
          <span className="text-ink-200">here, with us</span>. The pages exist as rows that only one
          renderer understands, so leaving means rebuilding.
        </p>
        <p>
          Start from the opposite requirement: whatever we publish has to be runnable by someone who
          has never heard of this application. Every decision after this one is a consequence of
          refusing to compromise on that.
        </p>
      </SceneHead>

      <Diagram className="mt-10" minWidth={660}>
        <svg viewBox="0 0 820 272" className="h-auto w-full" role="img" aria-hidden>
          {/* where it cannot get to */}
          <g ref={ghostRef} style={{ opacity: 0.28 }}>
            <rect
              x={16}
              y={98}
              width={104}
              height={106}
              rx={10}
              fill="none"
              stroke={C.ink600}
              strokeWidth={1}
              strokeDasharray="4 5"
            />
            <text
              x={68}
              y={144}
              textAnchor="middle"
              className="font-sans"
              fontSize={12}
              fill={C.ink300}
            >
              anywhere
            </text>
            <text
              x={68}
              y={161}
              textAnchor="middle"
              className="font-sans"
              fontSize={12}
              fill={C.ink300}
            >
              else
            </text>
          </g>

          <g ref={verdictRef} style={{ opacity: 0 }}>
            <text x={68} y={222} textAnchor="middle" className="font-mono" fontSize={11} fill={C.fail}>
              nothing arrives
            </text>
          </g>

          {/* the tethers, drawn before the card so they run underneath it */}
          {SLABS.map((s, i) => (
            <path
              key={s.label}
              ref={(el) => {
                tethers.current[i] = el;
              }}
              fill="none"
              stroke={C.ink600}
              strokeWidth={1.25}
              strokeLinecap="round"
              style={{ opacity: 0.35 }}
            />
          ))}

          {/* the site itself */}
          <g ref={cardRef}>
            <rect x={172} y={96} width={220} height={112} rx={12} fill={C.ink900} stroke={C.ink700} />
            <text x={196} y={130} className="font-sans" fontSize={16} fill={C.ink100} fontWeight={600}>
              your site
            </text>
            <text x={196} y={152} className="font-mono" fontSize={11} fill={C.ink400}>
              pages · theme · assets
            </text>
            <line x1={196} y1={166} x2={368} y2={166} stroke={C.ink700} />
            <text x={196} y={186} className="font-mono" fontSize={11} fill={C.ink500}>
              rendered on read
            </text>
          </g>

          {/* what it is tethered to */}
          {SLABS.map((s, i) => (
            <g
              key={s.label}
              ref={(el) => {
                slabRefs.current[i] = el;
              }}
              style={{ opacity: 0.12 }}
            >
              <rect
                ref={(el) => {
                  slabPlates.current[i] = el;
                }}
                x={SLAB_X}
                y={s.y}
                width={230}
                height={56}
                rx={10}
                fill={C.ink900}
                stroke={C.ink700}
              />
              <text x={SLAB_X + 18} y={s.y + 25} className="font-sans" fontSize={13} fill={C.ink200}>
                {s.label}
              </text>
              <text x={SLAB_X + 18} y={s.y + 42} className="font-mono" fontSize={10.5} fill={C.ink500}>
                {s.note}
              </text>
            </g>
          ))}
        </svg>
      </Diagram>
    </FlowScene>
  );
}
