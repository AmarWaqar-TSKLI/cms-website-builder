import type { ReactNode } from "react";

/**
 * The auth family's split-screen shell: a loud violet brand panel with the
 * product's promise and a marquee of block names (its own vocabulary), and a
 * calm paper panel where the form does its one job. Small screens drop the
 * brand half — there, the form IS the page.
 */
export function AuthSplit({
  heading,
  sub,
  children,
}: {
  heading: ReactNode;
  sub: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-ink-950 lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden border-r-2 border-ink-100 bg-flux-500 lg:flex lg:flex-col lg:justify-between">
        <a
          href="/"
          className="m-8 inline-grid h-12 w-12 place-items-center rounded-2xl border-2 border-ink-100 bg-ink-900 text-[20px] font-semibold text-ink-100 shadow-punch-sm transition-transform hover:-rotate-6"
          aria-label="Back to home"
        >
          ◈
        </a>
        <div className="px-8 pb-6">
          <h2 className="display-mega text-[clamp(30px,3.6vw,46px)] leading-[1.08] text-white">
            Build it.
            <br />
            Publish it.
            <br />
            <span className="inline-block -rotate-1 rounded-xl border-2 border-ink-100 bg-pop-yellow px-3 text-ink-100 shadow-punch-sm">
              Undo it.
            </span>
          </h2>
          <p className="mt-4 max-w-[34ch] text-[14px] leading-relaxed text-white/80">
            Every publish is a version. Every version is one click away, forever.
          </p>
        </div>
        <div className="border-t-2 border-ink-100 bg-ink-900 py-3" aria-hidden>
          <div className="marquee-track gap-8 whitespace-nowrap font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-ink-400">
            {[0, 1].map((half) => (
              <span key={half} className="flex gap-8">
                {"Hero · Pricing · FAQ · Testimonial · Gallery · Cta · Columns · Stat · Products · Blog · Form ·"
                  .split(" · ")
                  .map((w, i) => (
                    <span key={i}>{w}</span>
                  ))}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <div className="grid place-items-center px-6 py-10">
        <div className="anim-rise w-full max-w-sm">
          <div className="mb-8">
            <a
              href="/"
              className="mb-6 inline-grid h-12 w-12 place-items-center rounded-2xl border-2 border-ink-100 bg-flux-500 text-[20px] font-semibold text-white shadow-punch-sm transition-transform hover:-rotate-6 lg:hidden"
              aria-label="Back to home"
            >
              ◈
            </a>
            <h1 className="display-mega text-[clamp(28px,4vw,36px)] text-ink-100">{heading}</h1>
            <p className="mt-2.5 max-w-xs text-[14.5px] leading-relaxed text-ink-400">{sub}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
