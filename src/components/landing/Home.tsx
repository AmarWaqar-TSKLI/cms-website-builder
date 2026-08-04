"use client";

/**
 * THE FRONT DOOR — a dark, animated, Railway-class landing.
 *
 * The centrepiece is an animated circuit board, and it is not decoration: the
 * traces ARE the product's architecture. Pulses flow from EDIT through an
 * immutable version chip to LIVE — and one amber pulse flows backwards, because
 * rollback is a first-class direction here. The page's biggest visual claim is
 * the same claim the codebase makes.
 *
 * Self-contained: inline SVG + CSS keyframes, no animation libraries. Every
 * animation dies under prefers-reduced-motion (the global guard in globals.css
 * zeroes durations; the Reveal primitive no-ops on its own).
 */
import Link from "next/link";
import { Reveal } from "./Reveal";

/* ── the circuit ───────────────────────────────────────────────────────────── */

/** Orthogonal traces, hero-wide. Base rails are faint; pulse copies travel. */
const TRACES = [
  // main artery: edit → version → live
  "M 40 210 H 300 Q 312 210 312 222 V 300 Q 312 312 324 312 H 560",
  "M 640 312 H 880 Q 892 312 892 300 V 222 Q 892 210 904 210 H 1160",
  // side taps
  "M 160 60 V 150 Q 160 162 172 162 H 300 Q 312 162 312 174 V 198",
  "M 1040 480 V 372 Q 1040 360 1028 360 H 916 Q 904 360 904 348 V 324",
  "M 480 480 V 400 Q 480 388 492 388 H 560",
  "M 720 60 V 140 Q 720 152 708 152 H 640",
] as const;

/** The rollback rail — drawn right-to-left so its pulse flows BACKWARDS. */
const ROLLBACK = "M 1160 258 H 720 Q 708 258 708 270 V 388 Q 708 400 696 400 H 40";

function Circuit() {
  return (
    <svg
      viewBox="0 0 1200 520"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <radialGradient id="cir-fade" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="cir-mask">
          <rect width="1200" height="520" fill="url(#cir-fade)" />
        </mask>
      </defs>

      <g mask="url(#cir-mask)">
        {/* dotted board */}
        {Array.from({ length: 14 }, (_, r) =>
          Array.from({ length: 30 }, (_, c) => (
            <circle key={`${r}-${c}`} cx={20 + c * 40} cy={20 + r * 36} r="1" fill="rgba(255,255,255,0.07)" />
          )),
        )}

        {/* base rails */}
        {[...TRACES, ROLLBACK].map((d, i) => (
          <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />
        ))}

        {/* travelling pulses — violet forward */}
        {TRACES.map((d, i) => (
          <path
            key={`p${i}`}
            d={d}
            fill="none"
            stroke="var(--color-flux-400)"
            strokeWidth="2"
            strokeLinecap="round"
            className="cir-pulse"
            style={{ animationDelay: `${i * 0.9}s`, animationDuration: `${5 + (i % 3)}s` }}
          />
        ))}
        {/* the rollback pulse — amber, flowing back */}
        <path
          d={ROLLBACK}
          fill="none"
          stroke="var(--color-pop-yellow)"
          strokeWidth="2"
          strokeLinecap="round"
          className="cir-pulse cir-reverse"
          style={{ animationDuration: "7s" }}
        />

        {/* nodes */}
        <g fontFamily="var(--font-mono)" fontSize="11" fontWeight="600">
          <g>
            <rect x="560" y="286" width="80" height="52" rx="10" fill="var(--color-ink-900)" stroke="var(--color-flux-500)" strokeWidth="2" />
            <text x="600" y="308" textAnchor="middle" fill="var(--color-flux-300)">v12</text>
            <text x="600" y="324" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="9">
              immutable
            </text>
          </g>
          <g>
            <rect x="40" y="186" width="64" height="34" rx="8" fill="var(--color-ink-900)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
            <text x="72" y="207" textAnchor="middle" fill="rgba(255,255,255,0.75)">EDIT</text>
          </g>
          <g className="cir-glow">
            <rect x="1096" y="186" width="64" height="34" rx="8" fill="var(--color-live-500)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
            <text x="1128" y="207" textAnchor="middle" fill="#04120c">LIVE</text>
          </g>
          <text x="46" y="394" fill="var(--color-pop-yellow)" fontSize="10">
            ← rollback: move one pointer
          </text>
        </g>
      </g>

      <style>{`
        .cir-pulse {
          stroke-dasharray: 70 1400;
          stroke-dashoffset: 1470;
          animation: cir-dash linear infinite;
          filter: drop-shadow(0 0 6px currentColor);
        }
        .cir-reverse { animation-direction: reverse; }
        @keyframes cir-dash { to { stroke-dashoffset: 0; } }
        .cir-glow { animation: cir-breathe 2.4s ease-in-out infinite; }
        @keyframes cir-breathe {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }
      `}</style>
    </svg>
  );
}

/* ── bento cells ───────────────────────────────────────────────────────────── */

function Cell({
  title,
  body,
  visual,
  wide,
  delay = 0,
}: {
  title: string;
  body: string;
  visual: React.ReactNode;
  wide?: boolean;
  delay?: number;
}) {
  return (
    <Reveal
      delay={delay}
      className={`group relative overflow-hidden rounded-2xl border-2 border-ink-800 bg-ink-900 p-6 transition-colors duration-200 hover:border-flux-500 ${
        wide ? "md:col-span-2" : ""
      }`}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-flux-500/10 blur-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="mb-4 h-24">{visual}</div>
      <h3 className="display text-[17px] text-ink-100">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">{body}</p>
    </Reveal>
  );
}

/** Tiny inline visuals — each cell demos its own feature. */
const DiffVisual = () => (
  <div className="flex h-full flex-col justify-center gap-1.5 font-mono text-[11px]">
    <span className="w-fit rounded bg-fail-500/15 px-2 py-0.5 text-fail-500 line-through">Handcrafted espresso, daily.</span>
    <span className="w-fit rounded bg-live-500/15 px-2 py-0.5 text-live-500">Espresso with attitude. Open late.</span>
    <span className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-500">
      <input type="checkbox" readOnly checked className="h-3 w-3 accent-[var(--color-flux-500)]" /> merge this one
    </span>
  </div>
);

const RollbackVisual = () => (
  <div className="relative flex h-full items-center justify-center">
    {["v10", "v11", "v12"].map((v, i) => (
      <span
        key={v}
        className={`absolute rounded-lg border-2 px-3 py-1.5 font-mono text-[11px] transition-transform duration-300 ${
          i === 2
            ? "border-flux-500 bg-ink-950 text-flux-300 group-hover:-translate-x-14"
            : i === 1
              ? "translate-x-8 border-ink-700 bg-ink-900 text-ink-400 group-hover:-translate-x-4 group-hover:border-flux-500 group-hover:text-flux-300"
              : "translate-x-16 border-ink-800 bg-ink-900 text-ink-500 group-hover:translate-x-6"
        }`}
      >
        {v}
      </span>
    ))}
    <span className="absolute bottom-0 right-0 font-mono text-[10px] text-pop-yellow">UPDATE sites SET live = …</span>
  </div>
);

const AiVisual = () => (
  <div className="flex h-full flex-col justify-center gap-2">
    <div className="w-fit rounded-xl border-2 border-ink-700 bg-ink-950 px-3 py-1.5 font-mono text-[11px] text-ink-300">
      &ldquo;a bakery in Lisbon&rdquo;
    </div>
    <div className="flex gap-1.5">
      {["Hero", "Menu", "FAQ", "Cta"].map((b, i) => (
        <span
          key={b}
          className="rounded-md border border-flux-500/50 bg-flux-500/10 px-2 py-0.5 font-mono text-[10px] text-flux-300 opacity-0 [animation:rise_.4s_ease_forwards]"
          style={{ animationDelay: `${0.15 * i}s` }}
        >
          {b}
        </span>
      ))}
    </div>
  </div>
);

const DomainVisual = () => (
  <div className="flex h-full items-center justify-center">
    <div className="flex items-center gap-2 rounded-xl border-2 border-ink-700 bg-ink-950 px-4 py-2.5 font-mono text-[12px]">
      <span className="text-live-500">🔒</span>
      <span className="text-ink-200">
        yourcafe<span className="text-ink-500">.com</span>
      </span>
      <span className="ml-2 rounded bg-live-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-live-500">cert · auto</span>
    </div>
  </div>
);

const ApiVisual = () => (
  <pre className="flex h-full items-center font-mono text-[10.5px] leading-relaxed text-ink-400">
    {`GET /api/v1/sites/cafe/content
{ "version": `}
    <span className="text-flux-300">12</span>
    {`, "pages": [...] }`}
  </pre>
);

const ExportVisual = () => (
  <div className="flex h-full items-center gap-2 font-mono text-[11px] text-ink-400">
    <span className="rounded-lg border-2 border-ink-700 bg-ink-950 px-2.5 py-1">site.zip</span>
    <span className="text-ink-600">→</span>
    <span className="rounded-lg border-2 border-ink-700 bg-ink-950 px-2.5 py-1">next build</span>
    <span className="text-ink-600">→</span>
    <span className="text-live-500">✓ 5/5 pages</span>
  </div>
);

/* ── the page ──────────────────────────────────────────────────────────────── */

const BLOCKS =
  "Hero · Pricing · FAQ · Testimonial · Gallery · Columns · Stat · Products · Blog · Form · Cta ·";

export default function Home() {
  return (
    <div className="theme-dark min-h-screen overflow-x-clip bg-ink-950 text-ink-200">
      {/* nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-bold text-ink-100">
          <span className="grid h-9 w-9 place-items-center rounded-xl border-2 border-white/20 bg-flux-500 text-white shadow-punch-sm">
            ◈
          </span>
          Sitesmith
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/how-it-works"
            className="hidden rounded-lg px-3 py-2 text-[13px] font-medium text-ink-300 transition-colors hover:text-ink-100 sm:block"
          >
            How it works
          </Link>
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-ink-300 transition-colors hover:text-ink-100"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="punchable rounded-xl border-2 border-white/25 bg-flux-500 px-4 py-2 text-[13px] font-bold text-white hover:bg-flux-400 hover:shadow-punch-sm"
          >
            Start free
          </Link>
        </nav>
      </header>

      {/* hero + circuit */}
      <section className="relative mx-auto max-w-6xl px-6 pb-10 pt-14 sm:pt-20">
        <div className="absolute inset-0 -z-0">
          <Circuit />
        </div>
        <div className="relative z-10 max-w-[640px]">
          <Reveal>
            <span className="sticker inline-block -rotate-1 rounded-lg border-2 border-white/25 bg-pop-yellow px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-950 shadow-punch-sm">
              git for websites
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display-mega mt-5 text-[clamp(40px,7vw,72px)] text-white">
              Ship websites
              <br />
              like <span className="text-flux-300">software.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-ink-300">
              A drag-and-drop builder where every publish is an <b className="text-ink-100">immutable version</b>.
              Branch it, merge it, translate it, roll it back in one click — live on your own domain
              with HTTPS handled for you.
            </p>
          </Reveal>
          <Reveal delay={240} className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="punchable rounded-2xl border-2 border-white/25 bg-flux-500 px-6 py-3.5 text-[15px] font-bold text-white hover:bg-flux-400 hover:shadow-punch"
            >
              Start building — it&rsquo;s free
            </Link>
            <Link
              href="/how-it-works"
              className="punchable rounded-2xl border-2 border-ink-700 bg-ink-900/70 px-6 py-3.5 text-[15px] font-bold text-ink-200 backdrop-blur hover:border-ink-500 hover:shadow-punch"
            >
              See the machinery →
            </Link>
          </Reveal>
        </div>
        {/* breathing room for the circuit to read on wide screens */}
        <div className="h-40 sm:h-52" aria-hidden />
      </section>

      {/* marquee */}
      <div className="border-y-2 border-ink-800 bg-ink-900/60 py-3" aria-hidden>
        <div className="marquee-track gap-8 whitespace-nowrap font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-ink-500">
          {[0, 1].map((h) => (
            <span key={h} className="flex gap-8">
              {BLOCKS.split(" · ").map((w, i) => (
                <span key={i} className={i % 4 === 0 ? "text-flux-300" : undefined}>
                  {w}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* the three facts */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <h2 className="display-mega max-w-[24ch] text-[clamp(26px,4vw,40px)] text-white">
            Three facts. Everything else falls out of them.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            ["01", "A page is a description", "Blocks with stable ids — not baked HTML. That's why a website can be diffed, merged and translated like code."],
            ["02", "Publish is immutable", "Every publish writes a version that nothing can ever edit. Your history is permanent, and permanent means trustworthy."],
            ["03", "Serving is one pointer", "The live site is a single reference to one version. Rollback moves the pointer — no rebuild, no cache purge, no waiting."],
          ].map(([n, t, b], i) => (
            <Reveal
              key={n}
              delay={i * 100}
              className="rounded-2xl border-2 border-ink-800 bg-ink-900 p-6 transition-colors hover:border-flux-500"
            >
              <span className="font-mono text-[11px] font-bold text-flux-300">{n}</span>
              <h3 className="display mt-2 text-[18px] text-ink-100">{t}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-400">{b}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* bento */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Cell
            wide
            title="Branch a website. Review the diff. Merge."
            body="Fork the whole site, let the AI rebrand the copy, then cherry-pick the changes you like — merged and published as one version, undone with one click."
            visual={<DiffVisual />}
          />
          <Cell
            delay={80}
            title="Rollback is a pointer move"
            body="Nothing is rebuilt, purged or warmed. The old version was never destroyed — the site just points at it again."
            visual={<RollbackVisual />}
          />
          <Cell
            delay={120}
            title="Describe it, get a site"
            body="One sentence in, a multi-page site out — real copy, editable blocks, nothing the registry didn't approve."
            visual={<AiVisual />}
          />
          <Cell
            delay={160}
            title="Your domain, certs included"
            body="Point your nameservers once. DNS, wildcard records and HTTPS certificates are handled from then on."
            visual={<DomainVisual />}
          />
          <Cell
            delay={200}
            title="A headless API that can't drift"
            body="The API reads the same immutable version as the site. Roll back and both move together — there is nothing to desync."
            visual={<ApiVisual />}
          />
          <Cell
            delay={240}
            title="Leave whenever you want"
            body="Export any version as a real Next.js project that builds on your laptop. Hosting is the product; the exit is a feature."
            visual={<ExportVisual />}
          />
        </div>
      </section>

      {/* finale */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal className="punchable relative overflow-hidden rounded-3xl border-2 border-white/25 bg-flux-500 p-10 text-center shadow-punch-lg sm:p-16">
          <h2 className="display-mega text-[clamp(30px,5vw,52px)] text-white">
            Your first version,
            <br />
            live in five minutes.
          </h2>
          <p className="mx-auto mt-4 max-w-[40ch] text-[15px] leading-relaxed text-white/85">
            Free to build, free to publish. Bring a domain when you&rsquo;re ready.
          </p>
          <Link
            href="/signup"
            className="punchable mt-8 inline-block rounded-2xl border-2 border-ink-950 bg-pop-yellow px-8 py-4 text-[16px] font-bold text-ink-950 hover:shadow-punch"
          >
            Start free →
          </Link>
        </Reveal>
      </section>

      <footer className="border-t-2 border-ink-800 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 font-mono text-[11px] text-ink-500">
          <span>◈ Sitesmith — a page is a description, not a document.</span>
          <span className="flex gap-5">
            <Link href="/how-it-works" className="hover:text-ink-200">
              how it works
            </Link>
            <Link href="/walkthrough" className="hover:text-ink-200">
              walkthrough
            </Link>
            <Link href="/login" className="hover:text-ink-200">
              sign in
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
