import Link from "next/link";
import { DbInspector } from "@/components/walkthrough/DbInspector";
import { Mono, Note } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Walkthrough — how it works" };

/** Each link forced by the one before it. */
const CHAIN: { claim: string; because: string }[] = [
  {
    claim: "A site should run anywhere",
    because:
      "If a site can only exist on our servers, we own the customer rather than serve them. Portability is the requirement everything else has to bend around.",
  },
  {
    claim: "So publish must produce a package, not a database flag",
    because:
      "“Published = true” is meaningless off our infrastructure. A package is a thing you can carry away.",
  },
  {
    claim: "So we need a source that compiles to multiple targets",
    because:
      "One package format would only move the trap. Static host, container, and our own hosting all have to be reachable from the same input.",
  },
  {
    claim: "So store a description, not HTML",
    because:
      "HTML is already a compilation target — storing it picks the destination before you know it. A tree of {type, props, children} is not yet committed to anything.",
  },
  {
    claim: "Descriptions are cheap, so append instead of overwriting",
    because:
      "A page body is a couple of kilobytes. Keeping every published arrangement forever costs nothing next to the value of returning to one that worked.",
  },
  {
    claim: "So rollback is a pointer swap",
    because:
      "Every past version is already built and still stored. Going back does not restore, migrate, or rebuild — it repoints.",
  },
  {
    claim: "But only for what should roll back",
    because:
      "Reverting a homepage design must not un-place yesterday's orders. Versioned appearance and live business data are separated, and exactly one column crosses: sites.live_release_id.",
  },
  {
    claim: "So one build reaches three destinations",
    because:
      "Hosted URL, static zip, container image — the same release id, the same bytes. Hosting is the product; export is the escape hatch.",
  },
];

/** The guided path through the inspector for a first-time visitor. */
const TRY_STEPS: [string, string][] = [
  [
    "Fire 10 autosaves",
    "Ten edits are saved. page_drafts stays at one row per page; only lock_version climbs. Drafts are overwritten, never piled up.",
  ],
  [
    "Publish",
    "Returns in milliseconds while the build is still queued. page_revisions grows by one row per page, and a new release appears.",
  ],
  [
    "Open the published site",
    "Use the Hosted link under “Three destinations”. You are looking at the release that is now live.",
  ],
  [
    "Roll back one version",
    "The live pointer moves to the previous release. Reload the site: it changed instantly, and nothing was rebuilt.",
  ],
];

const FLOWS = [
  {
    title: "Editing",
    steps: [
      ["Keystroke", "Zustand only. No network, no await — the canvas is a pure function of local state."],
      ["Every 2s", "PUT /api/pages/:id/draft ships the whole tree."],
      ["page_drafts", "One row, OVERWRITTEN. page_id is the primary key, so this is enforced, not intended."],
      ["Conflict", "lock_version mismatch → 409 → “edited in another tab”. Nobody's work is silently lost."],
    ],
    tone: "flux",
  },
  {
    title: "Publishing",
    steps: [
      ["One transaction", "Promote every draft to a revision, create the release, write the manifest and the dependency edges, enqueue a job."],
      ["Return", "Under 200ms, with the release still `building` and the job still `queued`. No HTML exists yet."],
      ["Build job", "Claimed with FOR UPDATE SKIP LOCKED (by the worker, or inline on serverless). It freezes the live data the release uses."],
      ["Only then", "status=ready, and sites.live_release_id moves. A failed build never reaches this line."],
    ],
    tone: "warn",
  },
  {
    title: "Serving",
    steps: [
      ["Request", "GET /s/acme-store"],
      ["Lookup", "One query: which release is this site pointing at?"],
      ["Render", "That release's pages and frozen data, rendered once and cached forever. It never changes."],
      ["Never", "No drafts, no live prices. What visitors see is exactly what was published."],
    ],
    tone: "live",
  },
] as const;

export default function Walkthrough() {
  return (
    <div className="min-h-screen bg-paper text-coal">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <nav className="flex items-baseline justify-between border-b-2 border-coal py-4">
          <Link href="/" className="font-[family-name:var(--font-display)] text-[20px] font-extrabold tracking-tight">
            cms<span className="text-tomato">/</span>builder
          </Link>
          <Link href="/dashboard" className="text-[14px] font-medium underline decoration-2 underline-offset-4 hover:text-tomato">
            Dashboard
          </Link>
        </nav>
      </div>

      <main className="mx-auto max-w-6xl px-5 pt-14 pb-16 sm:px-8">
        <header className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <p className="kicker text-tomato">The walkthrough</p>
            <h1 className="display-mega mt-4 text-[clamp(44px,6.4vw,80px)]">
              See it work in <span className="mark-sun">four clicks.</span>
            </h1>
          </div>
          <p className="max-w-[46ch] text-[17px] leading-relaxed text-coal/80">
            The buttons below call the real API against the real Postgres database, and every counter is read
            straight from it. Follow the steps in order.
          </p>
        </header>

        {/* ── Try it ──────────────────────────────────────────────────────── */}
        <section className="mt-12 mb-16">
          <ol className="mb-10 border-t-2 border-coal">
            {TRY_STEPS.map(([title, body], i) => (
              <li
                key={title}
                className="grid grid-cols-[44px_1fr] gap-x-4 gap-y-1 border-b border-coal/25 py-4 md:grid-cols-[56px_260px_1fr] md:items-baseline"
              >
                <span className="font-[family-name:var(--font-display)] text-[30px] leading-none font-extrabold text-tomato">
                  {i + 1}
                </span>
                <h2 className="font-[family-name:var(--font-display)] text-[19px] font-bold">{title}</h2>
                <p className="col-start-2 text-[15px] leading-relaxed text-coal/80 md:col-start-3">{body}</p>
              </li>
            ))}
          </ol>
          <DbInspector />
        </section>

        <h2 className="display-mega mb-10 border-t-2 border-coal pt-12 text-[clamp(34px,4.6vw,56px)]">
          Why it&apos;s built this way
        </h2>

        {/* ── The chain ───────────────────────────────────────────────────── */}
        <section className="mb-16 grid gap-6 lg:grid-cols-[1fr_2.2fr]">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-[24px] font-bold">The reasoning chain</h3>
            <p className="mt-2 text-[15px] text-coal/70">Each step is forced by the one above it.</p>
          </div>
          <ol>
            {CHAIN.map((link, i) => (
              <li key={link.claim} className="grid grid-cols-[36px_1fr] gap-x-3 border-t border-coal/25 py-4 first:border-t-2 first:border-coal">
                <span className="font-mono text-[13px] font-semibold text-tomato">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h4 className="text-[16px] font-semibold">{link.claim}</h4>
                  <p className="mt-1 max-w-2xl text-[14.5px] leading-relaxed text-coal/75">{link.because}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Three flows ─────────────────────────────────────────────────── */}
        <section className="mb-16 grid gap-6 lg:grid-cols-[1fr_2.2fr]">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-[24px] font-bold">Three flows</h3>
            <p className="mt-2 text-[15px] text-coal/70">The same system seen from the three directions it gets used from.</p>
          </div>
          <div>
            {FLOWS.map((flow) => (
              <div key={flow.title} className="grid gap-3 border-t-2 border-coal py-6 md:grid-cols-[140px_1fr]">
                <h4
                  className={`self-start px-2 py-1 font-mono text-[12px] font-semibold uppercase tracking-[0.12em] md:justify-self-start ${
                    flow.tone === "live"
                      ? "bg-coal text-paper"
                      : flow.tone === "warn"
                        ? "bg-sun text-coal"
                        : "bg-cobalt text-paper"
                  } justify-self-start`}
                >
                  {flow.title}
                </h4>
                <ol className="grid gap-3 sm:grid-cols-2">
                  {flow.steps.map(([label, detail]) => (
                    <li key={label}>
                      <div className="font-mono text-[12px] font-semibold">{label}</div>
                      <div className="mt-0.5 text-[14px] leading-relaxed text-coal/75">{detail}</div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

      {/* ── What's actually stored ────────────────────────────────────────── */}
      <section className="mb-14">
        <h3 className="mb-1 font-[family-name:var(--font-display)] text-[24px] font-bold">What is actually in the row</h3>
        <Note className="mb-4 text-[14px]">
          This is a real page body, in full. Search it for a single angle bracket.
        </Note>
        <pre className="overflow-x-auto border-2 border-coal bg-coal p-5 font-mono text-[12px] leading-relaxed text-paper">
{`{
  "version": 1,
  "root": [
    { "type": "Hero",
      "props": { "headline": "Everything here is a description.",
                 "background": "media_9f21…",     ← ref, becomes a dependency
                 "padding": "xl" },
      "children": [] },
    { "type": "ProductGrid",
      "props": { "collection": "col_4c7a…",       ← ref, fans out to its products
                 "columns": "3" },
      "children": [] }
  ]
}`}
        </pre>
        <Note className="mt-3 text-[14px]">
          <Mono className="text-coal">&quot;Hero&quot;</Mono> is a lookup key. The registry maps
          it to a React component that both the editor canvas and the build worker call — which is
          why the preview cannot drift from the output.
        </Note>
      </section>

      <footer className="border-t-2 border-coal pt-8">
        <p className="text-[15px] text-coal/80">
          Run <Mono className="text-coal">make verify</Mono> to see all sixteen invariants checked with a
          PASS/FAIL line each.
        </p>
        <div className="mt-6 flex flex-wrap gap-4">
          <Link href="/dashboard" className="btn-poster bg-tomato text-[15px] text-paper">
            Open the editor <span aria-hidden>→</span>
          </Link>
          <Link href="/s/acme-store" className="btn-poster bg-sun text-[15px]">
            View the published site
          </Link>
        </div>
      </footer>
      </main>
    </div>
  );
}
