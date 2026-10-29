import Link from "next/link";
import { ReleaseDiagram } from "@/components/landing/ReleaseDiagram";

/**
 * The homepage, set like a printed poster: what this is, the one line that
 * makes rollback instant, a drawing of the mechanism, the problems it solves,
 * and three ways in (walkthrough, dashboard, a published site).
 */

const PROBLEMS = [
  {
    title: "Run anywhere, roll back instantly",
    problem:
      "A site should be portable (hosted, static zip, container) and still roll back in a blink. Usually you get one or the other.",
    fix: "Every publish freezes a complete, immutable release. Any release can be served or exported, and the live site is one pointer to one of them, so rollback is a single column update.",
  },
  {
    title: "Edit the header once, not ten times",
    problem: "A header or announcement bar used on many pages should change in one place, and roll back in one piece.",
    fix: "Shared components are stored as references, never copies. Edit one, publish, and every page that uses it changes. Roll back and they all return together, because the release pinned the revision.",
  },
  {
    title: "Immutable has to be enforced, not promised",
    problem: "“We never overwrite history” is easy to say and easy to break with one careless UPDATE.",
    fix: "Append-only history is enforced by a database trigger that rejects UPDATE and DELETE, and make verify checks 16 invariants against the running stack, printing PASS or FAIL for each.",
  },
];

function DemoLogin({ className = "" }: { className?: string }) {
  return (
    <p className={`font-mono text-[13px] text-coal ${className}`}>
      <span className="bg-sun px-1.5 py-0.5">demo login</span>{" "}
      amar@acme.test <span className="text-coal/50">/</span> demo1234
    </p>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-paper text-coal">
      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <nav className="flex items-baseline justify-between border-b-2 border-coal py-4">
          <Link href="/" className="font-[family-name:var(--font-display)] text-[20px] font-extrabold tracking-tight">
            cms<span className="text-tomato">/</span>builder
          </Link>
          <div className="flex items-baseline gap-5 text-[14px] font-medium">
            <a href="https://github.com/AmarWaqar-TSKLI/cms-website-builder" className="hover:text-tomato">
              GitHub
            </a>
            <Link href="/login" className="underline decoration-2 underline-offset-4 hover:text-tomato">
              Sign in
            </Link>
          </div>
        </nav>

        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <header className="grid gap-12 py-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10 lg:py-20">
          <div>
            <p className="kicker text-tomato">A website builder · built by Amar Waqar</p>
            <h1 className="display-mega mt-5 text-[clamp(48px,7.4vw,96px)]">
              Publish in a blink. Roll back in <span className="mark-sun">one line.</span>
            </h1>
            <p className="mt-7 max-w-[46ch] text-[18px] leading-relaxed text-coal/80">
              Pages are stored as data, every publish is a frozen release, and the live site is a single
              pointer. Edit, publish and undo below, and watch the database change as you click.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/walkthrough" className="btn-poster bg-tomato text-[16px] text-paper">
                Start the walkthrough <span aria-hidden>→</span>
              </Link>
              <Link href="/dashboard" className="btn-poster bg-paper text-[16px]">
                Open the dashboard
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <DemoLogin />
              <a href="/s/acme-store" className="text-[14px] font-semibold underline decoration-2 underline-offset-4 hover:text-tomato">
                View a published site
              </a>
            </div>
          </div>

          {/* A real render of the seeded store, framed like a pasted-up print. */}
          <figure className="relative mr-3 mb-3 lg:mr-0">
            <div className="absolute inset-0 translate-x-3 translate-y-3 bg-cobalt" aria-hidden />
            <div className="relative border-2 border-coal bg-white">
              <div className="flex items-center gap-3 border-b-2 border-coal bg-paper-deep px-3 py-2 font-mono text-[12px]">
                <span className="truncate">/s/acme-store</span>
                <span className="ml-auto shrink-0 bg-coal px-1.5 py-0.5 text-paper">release v3</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/acme-home.webp"
                width={1920}
                height={1500}
                alt="The published Acme Store home page: an announcement bar, a hero reading 'Everything here is a description.', and a featured product grid."
                className="block h-auto w-full"
              />
            </div>
            <figcaption className="absolute -bottom-4 left-4 bg-tomato px-2.5 py-1 font-mono text-[12px] text-paper shadow-[3px_3px_0_var(--color-coal)]">
              compiled from JSON, not stored as HTML
            </figcaption>
          </figure>
        </header>
      </div>

      {/* ── The one line ─────────────────────────────────────────────────── */}
      <section className="bg-tomato text-paper">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="kicker text-paper/80">The entire rollback</p>
          <p className="mt-5 font-mono text-[clamp(20px,3.6vw,44px)] font-semibold leading-tight break-words">
            UPDATE sites SET live_release_id = <span className="bg-coal px-2">&apos;R2&apos;</span>;
          </p>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-paper/90">
            No rebuild, no cache purge, no file written. The old release was never deleted, so going back is
            just pointing at it again.
          </p>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:items-end">
          <h2 className="display-mega text-[clamp(36px,5vw,60px)]">How a publish works</h2>
          <p className="max-w-[56ch] text-[17px] leading-relaxed text-coal/80">
            Drafts are overwritten while you type. Publishing appends a release and never edits an old one.
            Exactly one value decides what is live, and rollback only moves that value.
          </p>
        </div>
        <div className="mt-12 border-y-2 border-coal py-10">
          <ReleaseDiagram />
        </div>
      </section>

      {/* ── Problems I solved ────────────────────────────────────────────── */}
      <section className="bg-cobalt text-paper">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="display-mega text-[clamp(36px,5vw,60px)]">Problems I solved</h2>
          <ol className="mt-12">
            {PROBLEMS.map((p, i) => (
              <li
                key={p.title}
                className="grid gap-4 border-t-2 border-paper/30 py-10 md:grid-cols-[120px_1fr_1.4fr] md:gap-10"
              >
                <span className="font-[family-name:var(--font-display)] text-[64px] leading-none font-extrabold text-sun">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-[26px] leading-tight font-bold">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-[16px] leading-relaxed text-paper/80">{p.problem}</p>
                </div>
                <div>
                  <p className="kicker text-sun">What I built</p>
                  <p className="mt-2 text-[16px] leading-relaxed">{p.fix}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Closing ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h2 className="display-mega max-w-[14ch] text-[clamp(44px,7vw,88px)]">
          Try it. Break it. <span className="text-tomato">Roll it back.</span>
        </h2>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href="/walkthrough" className="btn-poster bg-tomato text-[16px] text-paper">
            Start the walkthrough <span aria-hidden>→</span>
          </Link>
          <a href="/s/acme-store" className="btn-poster bg-sun text-[16px]">
            View a published site
          </a>
        </div>
        <DemoLogin className="mt-6" />
      </section>

      <footer className="border-t-2 border-coal">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5 py-6 text-[14px] sm:px-8">
          <span>
            Built by{" "}
            <a href="https://amarwaqar.vercel.app" className="font-semibold underline decoration-2 underline-offset-4 hover:text-tomato">
              Amar Waqar
            </a>
          </span>
          <span className="font-mono text-[13px] text-coal/70">Next.js · TypeScript · PostgreSQL · Prisma</span>
        </div>
      </footer>
    </div>
  );
}
