"use client";

import { useCallback, useRef, type ReactNode, type RefObject } from "react";
import ReleaseStackCanvas, { RELEASE_COUNT, ROLLBACK_INDEX, STACK_CUTS } from "./ReleaseStackCanvas";
import { usePrefersReducedMotion, useScrollPhase } from "./hooks";
import { clamp01, useScrollFrame } from "./scroll";
import { Kicker } from "./Chain";

export const HEAD_RELEASE = "rel_9d4c02f1";
export const ROLLBACK_RELEASE = "rel_7f3a91c4";

/** Nine publishes, chronological. Index 5 is the one rollback lands on; index 8
 *  is the head. Fixed strings so the ledger, the copy and the SQL agree. */
const IDS = [
  "rel_1a0e77b3",
  "rel_2c94de08",
  "rel_35b1af6d",
  "rel_4e02cc71",
  "rel_58da3b9f",
  ROLLBACK_RELEASE,
  "rel_8b25e0da",
  "rel_c41f6207",
  HEAD_RELEASE,
];

const ROW_H = 24;

function Sql() {
  return (
    <pre className="panel mt-6 overflow-x-auto px-4 py-3.5 font-mono text-[12px] leading-relaxed sm:text-[13px]">
      <code>
        <span className="text-flux-400">UPDATE</span> <span className="text-ink-100">sites</span>{" "}
        <span className="text-flux-400">SET</span>{" "}
        <span className="text-ink-100">live_release_id</span>{" "}
        <span className="text-ink-500">=</span>{" "}
        <span className="text-live-500">{`'${ROLLBACK_RELEASE}'`}</span>
        <span className="text-ink-500">;</span>
      </code>
    </pre>
  );
}

function Block({ children }: { children: ReactNode }) {
  return <div className="max-w-lg">{children}</div>;
}

const AppendCopy = () => (
  <Block>
    <p className="mono-xs mb-6 flex max-w-md flex-wrap items-baseline gap-x-2.5 gap-y-1 leading-relaxed">
      <span className="shrink-0 tracking-[0.22em] text-ink-600 uppercase">therefore</span>
      <span className="min-w-0 text-ink-400">
        A description is kilobytes. Keeping all of them is cheaper than deciding which to throw away.
      </span>
    </p>
    <Kicker n="05" label="append-only" />
    <h2 className="mt-5 text-3xl leading-[1.08] font-semibold tracking-tight text-ink-100 sm:text-4xl md:text-[2.5rem]">
      Descriptions are tiny. So nothing is ever destroyed.
    </h2>
    <p className="mt-5 text-[15px] leading-relaxed text-ink-400">
      Publish only ever <span className="text-ink-200">inserts</span>: a new release row, a new set
      of release items, a new immutable artifact on disk. Nothing already published is edited.
      Nothing is reordered. The log only grows.
    </p>
  </Block>
);

const HeadCopy = () => (
  <Block>
    <Kicker n="05" label="append-only" />
    <h2 className="mt-5 text-3xl leading-[1.08] font-semibold tracking-tight text-ink-100 sm:text-4xl md:text-[2.5rem]">
      Nine publishes. Nine releases. All nine still there.
    </h2>
    <p className="mt-5 text-[15px] leading-relaxed text-ink-400">
      Exactly one of them is live, because exactly one column says so. The other eight are not
      archived, not cold, not half-deleted — they are simply not being pointed at.
    </p>
    <p className="mono-xs mt-6 flex flex-wrap items-center gap-2 text-ink-500">
      <span className="text-ink-300">sites.live_release_id</span>
      <span aria-hidden>→</span>
      <span className="rounded border border-flux-500/40 bg-flux-500/10 px-2 py-1 text-flux-300">
        {HEAD_RELEASE}
      </span>
    </p>
  </Block>
);

const RollbackCopy = () => (
  <Block>
    <Kicker n="06" label="rollback" />
    <h2 className="mt-5 text-3xl leading-[1.08] font-semibold tracking-tight text-ink-100 sm:text-4xl md:text-[2.5rem]">
      Rollback is a pointer swap.
    </h2>
    <Sql />
    <p className="mt-4 text-[15px] leading-relaxed text-ink-400">
      No rebuild, no restore, no cache warm-up, no downtime. The release you rolled back to has been
      sitting on disk, finished and byte-identical, since the day it was built.
    </p>
    <p className="mt-3 text-[15px] leading-relaxed text-ink-300">
      Look at the stack: nothing moved. Only the pointer did.
    </p>
  </Block>
);

/**
 * The same state the WebGL stack is showing, written out as rows — so the
 * progression is legible even in a still, and so the pointer swap is something
 * you can read rather than infer from a glow.
 */
function Ledger({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const valueRef = useRef<HTMLSpanElement | null>(null);
  const countRef = useRef<HTMLSpanElement | null>(null);

  const draw = useCallback((p: number, reduced: boolean) => {
    const v = reduced ? 1 : p;
    const appendT = clamp01(v / STACK_CUTS[0]);
    const countF = 1 + appendT * (RELEASE_COUNT - 1);
    const head = Math.min(RELEASE_COUNT - 1, Math.floor(countF - 1e-4));
    const pointer = v >= STACK_CUTS[1] ? ROLLBACK_INDEX : head;

    for (let i = 0; i < RELEASE_COUNT; i++) {
      const el = rowRefs.current[i];
      if (!el) continue;
      const born = clamp01(countF - i);
      el.style.opacity = String(born);
      el.style.color = i === pointer ? "#a89dff" : "#6e6e80";
    }
    if (pillRef.current) {
      pillRef.current.style.transform = `translate3d(0,${(pointer * ROW_H).toFixed(1)}px,0)`;
      pillRef.current.style.opacity = String(clamp01(countF));
    }
    if (valueRef.current) {
      const s = IDS[pointer];
      if (valueRef.current.textContent !== s) valueRef.current.textContent = s;
    }
    if (countRef.current) {
      const s = `${Math.max(1, head + 1)} / ${RELEASE_COUNT} rows`;
      if (countRef.current.textContent !== s) countRef.current.textContent = s;
    }
  }, []);

  useScrollFrame(sectionRef, draw, "sticky");

  return (
    <div className="pointer-events-none absolute right-6 bottom-8 hidden w-[236px] lg:block">
      <div className="rounded-[12px] border border-ink-800 bg-ink-950/70 p-3 backdrop-blur-sm">
        <div className="mono-xs flex items-baseline justify-between gap-2 text-ink-500">
          <span className="tracking-[0.16em] uppercase">releases</span>
          <span ref={countRef} className="text-ink-600">
            1 / {RELEASE_COUNT} rows
          </span>
        </div>
        <div className="relative mt-2">
          <div
            ref={pillRef}
            aria-hidden
            className="absolute inset-x-0 top-0 rounded border border-flux-500/50 bg-flux-500/10"
            style={{ height: ROW_H, opacity: 0 }}
          />
          {IDS.map((id, i) => (
            <div
              key={id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              className="relative flex items-center justify-between gap-2 px-2 font-mono text-[10.5px]"
              style={{ height: ROW_H, opacity: 0, color: "#6e6e80" }}
            >
              <span>{id}</span>
              <span className="text-ink-700">#{i + 1}</span>
            </div>
          ))}
        </div>
        <div className="mono-xs mt-2 flex flex-wrap items-baseline gap-x-2 border-t border-ink-800 pt-2 text-ink-600">
          <span>live_release_id</span>
          <span ref={valueRef} className="text-flux-300">
            {IDS[0]}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Beats 05 and 06 share one canvas and one scroll range, because they are one
 * idea: an append-only log makes rollback free. The range is deliberately tight
 * — every pixel of it either appends a release or moves the pointer.
 */
export default function ReleaseStack() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const phase = useScrollPhase(sectionRef, STACK_CUTS);
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return (
      <section ref={sectionRef} data-beat="05" className="mx-auto w-full max-w-5xl px-6 py-16">
        <div className="relative h-[320px] w-full sm:h-[420px]">
          <ReleaseStackCanvas sectionRef={sectionRef} centered />
        </div>
        <div className="mt-10 space-y-16">
          <AppendCopy />
          <HeadCopy />
          <RollbackCopy />
        </div>
      </section>
    );
  }

  const blocks = [<AppendCopy key="a" />, <HeadCopy key="b" />, <RollbackCopy key="c" />];

  return (
    <section ref={sectionRef} data-beat="05" className="relative h-[162vh]">
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* Below lg the stack gets its own band above the copy; at lg it goes
            full-bleed and the copy sits over its left half. */}
        <div className="absolute inset-x-0 top-0 h-[38%] lg:inset-0 lg:h-full">
          <ReleaseStackCanvas sectionRef={sectionRef} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-ink-950/60 to-ink-950 lg:bg-gradient-to-r lg:from-ink-950 lg:via-ink-950/70 lg:to-transparent"
        />
        <Ledger sectionRef={sectionRef} />
        <div className="absolute inset-x-0 top-[36%] bottom-0 lg:inset-0">
          <div className="mx-auto flex h-full w-full max-w-5xl items-start px-6 lg:items-center">
            <div className="grid w-full grid-cols-1">
              {blocks.map((block, i) => (
                <div
                  key={i}
                  aria-hidden={phase !== i}
                  className={[
                    "col-start-1 row-start-1 min-w-0 transition-[opacity,transform] duration-500 ease-out",
                    phase === i
                      ? "translate-y-0 opacity-100"
                      : "pointer-events-none translate-y-3 opacity-0",
                  ].join(" ")}
                >
                  {block}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
