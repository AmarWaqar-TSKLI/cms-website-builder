"use client";

import { useRef, type ReactNode } from "react";
import ReleaseStackCanvas, { STACK_CUTS } from "./ReleaseStackCanvas";
import { usePrefersReducedMotion, useScrollPhase } from "./hooks";
import { Kicker } from "./Chain";

export const HEAD_RELEASE = "rel_9d4c02f1";
export const ROLLBACK_RELEASE = "rel_7f3a91c4";

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
    <Kicker n="05" label="append-only" />
    <h2 className="mt-6 text-3xl leading-[1.08] font-semibold tracking-tight text-ink-100 sm:text-4xl md:text-[2.75rem]">
      Descriptions are tiny. So nothing is ever destroyed.
    </h2>
    <p className="mt-6 text-[15px] leading-relaxed text-ink-400">
      A page description is a few kilobytes of JSON. Keeping every version of it costs less than
      the audit log you would need if you overwrote it. So publish only ever{" "}
      <span className="text-ink-200">inserts</span>: a new release row, a new set of release items,
      a new immutable artifact on disk.
    </p>
    <p className="mt-4 text-[15px] leading-relaxed text-ink-400">
      Nothing already published is edited. Nothing is reordered. The log only grows.
    </p>
  </Block>
);

const HeadCopy = () => (
  <Block>
    <Kicker n="05" label="append-only" />
    <h2 className="mt-6 text-3xl leading-[1.08] font-semibold tracking-tight text-ink-100 sm:text-4xl md:text-[2.75rem]">
      Nine publishes. Nine releases. All nine still there.
    </h2>
    <p className="mt-6 text-[15px] leading-relaxed text-ink-400">
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
    <h2 className="mt-6 text-3xl leading-[1.08] font-semibold tracking-tight text-ink-100 sm:text-4xl md:text-[2.75rem]">
      Rollback is a pointer swap.
    </h2>
    <Sql />
    <p className="mt-4 text-[15px] leading-relaxed text-ink-400">
      That is the entire rollback. No rebuild, no restore, no cache warm-up, no downtime. The
      release you rolled back to has been sitting on disk, finished and byte-identical, since the
      day it was built.
    </p>
    <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
      Look at the stack: nothing moved. Only the pointer did.
    </p>
  </Block>
);

/**
 * Beats 05 and 06 share one canvas and one scroll range, because they are one
 * idea: an append-only log makes rollback free. Splitting them into two
 * sections would have hidden the fact that the second is a consequence of the
 * first.
 */
export default function ReleaseStack() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const phase = useScrollPhase(sectionRef, STACK_CUTS);
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return (
      <section ref={sectionRef} className="mx-auto w-full max-w-5xl px-6">
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
    <section ref={sectionRef} className="relative h-[340vh]">
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* Below lg the stack gets its own band above the copy; at lg it goes
            full-bleed and the copy sits over its left half. */}
        <div className="absolute inset-x-0 top-0 h-[38%] lg:inset-0 lg:h-full">
          <ReleaseStackCanvas sectionRef={sectionRef} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-ink-950/60 to-ink-950 lg:bg-gradient-to-r lg:from-ink-950 lg:via-ink-950/75 lg:to-transparent"
        />
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
