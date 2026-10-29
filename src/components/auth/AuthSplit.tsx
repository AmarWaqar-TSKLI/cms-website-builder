import type { ReactNode } from "react";

/**
 * The auth family's split-screen shell: a tomato poster panel with the
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
    <main className="grid min-h-screen bg-paper text-coal lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden border-r-2 border-coal bg-tomato text-paper lg:flex lg:flex-col lg:justify-between">
        <a
          href="/"
          className="m-8 self-start font-[family-name:var(--font-display)] text-[22px] font-extrabold tracking-tight"
          aria-label="Back to home"
        >
          cms<span className="text-coal">/</span>builder
        </a>
        <div className="px-8 pb-10">
          <h2 className="display-mega text-[clamp(44px,5vw,76px)]">
            Build it.
            <br />
            Publish it.
            <br />
            <span className="text-sun">Undo it.</span>
          </h2>
          <p className="mt-6 max-w-[34ch] text-[16px] leading-relaxed text-paper/90">
            Every publish is a version. Every version is one click away, forever.
          </p>
        </div>
        <div className="border-t-2 border-coal bg-coal py-3" aria-hidden>
          <div className="marquee-track gap-8 whitespace-nowrap font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-paper/80">
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
              className="mb-8 inline-block font-[family-name:var(--font-display)] text-[20px] font-extrabold tracking-tight lg:hidden"
              aria-label="Back to home"
            >
              cms<span className="text-tomato">/</span>builder
            </a>
            <h1 className="display-mega text-[clamp(36px,4.4vw,52px)]">{heading}</h1>
            <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-coal/75">{sub}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
