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
      "Every past version is already built and still on disk. Going back does not restore, migrate, or rebuild — it repoints.",
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
      ["Worker", "A separate process claims the job with FOR UPDATE SKIP LOCKED and renders files to disk."],
      ["Only then", "status=ready, and sites.live_release_id moves. A failed build never reaches this line."],
    ],
    tone: "warn",
  },
  {
    title: "Serving",
    steps: [
      ["Request", "GET /s/acme-store"],
      ["Lookup", "One query: which release is this site pointing at?"],
      ["Read", "The corresponding file off disk. That's the response."],
      ["Never", "No registry, no revision table, no rendering. The serving module can't even import a renderer."],
    ],
    tone: "live",
  },
] as const;

export default function Walkthrough() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="mb-12">
        <Link href="/dashboard" className="text-[13px] text-ink-400 hover:text-ink-100">
          ← Dashboard
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          How it works, and how you can check
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-400">
          Every claim below is either enforced by a database constraint or covered by a test in{" "}
          <Mono className="text-ink-300">make verify</Mono>. The inspector at the bottom reads
          the live database so you can watch the structure behave rather than take it on faith.
        </p>
      </header>

      {/* ── The chain ─────────────────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">The reasoning chain</h2>
        <Note className="mb-6">Each step is forced by the one above it.</Note>

        <ol className="relative space-y-5 border-l border-ink-800 pl-6">
          {CHAIN.map((link, i) => (
            <li key={link.claim} className="relative">
              <span className="absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full border border-ink-700 bg-ink-950 font-mono text-[10px] text-ink-400">
                {i + 1}
              </span>
              <h3 className="text-[15px] font-medium text-ink-100">{link.claim}</h3>
              <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-400">
                {link.because}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Three flows ───────────────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Three flows</h2>
        <Note className="mb-6">
          The same system seen from the three directions it gets used from.
        </Note>

        <div className="grid gap-4 md:grid-cols-3">
          {FLOWS.map((flow) => (
            <div key={flow.title} className="rounded-2xl border border-ink-700 bg-ink-900/80 p-5">
              <h3
                className={`mb-4 text-[13px] font-semibold ${
                  flow.tone === "live"
                    ? "text-live-500"
                    : flow.tone === "warn"
                      ? "text-warn-500"
                      : "text-flux-300"
                }`}
              >
                {flow.title}
              </h3>
              <ol className="space-y-3">
                {flow.steps.map(([label, detail]) => (
                  <li key={label}>
                    <div className="font-mono text-[11px] text-ink-200">{label}</div>
                    <div className="mt-0.5 text-[12px] leading-relaxed text-ink-500">{detail}</div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* ── What's actually stored ────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">What is actually in the row</h2>
        <Note className="mb-4">
          This is a real page body, in full. Search it for a single angle bracket.
        </Note>
        <pre className="overflow-x-auto rounded-2xl border border-ink-700 bg-ink-950 p-5 font-mono text-[11.5px] leading-relaxed text-ink-300">
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
        <Note className="mt-3">
          <Mono className="text-ink-300">&quot;Hero&quot;</Mono> is a lookup key. The registry maps
          it to a React component that both the editor canvas and the build worker call — which is
          why the preview cannot drift from the output.
        </Note>
      </section>

      {/* ── Live inspector ────────────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Watch it happen</h2>
        <Note className="mb-6">
          These buttons hit the real endpoints against the real database. Fire ten autosaves and
          watch <Mono className="text-ink-300">page_drafts</Mono> refuse to move while{" "}
          <Mono className="text-ink-300">lock_version</Mono> climbs. Then publish, and watch{" "}
          <Mono className="text-ink-300">page_revisions</Mono> grow by exactly one row per page.
        </Note>
        <DbInspector />
      </section>

      <footer className="border-t border-ink-800 pt-8">
        <p className="text-[13px] text-ink-400">
          Run <Mono className="text-ink-200">make verify</Mono> to see all ten non-negotiables
          checked with a PASS/FAIL line each.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className="rounded-lg bg-flux-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-flux-400"
          >
            Open the editor
          </Link>
          <Link
            href="/s/acme-store"
            className="rounded-lg border border-ink-700 px-4 py-2 text-[13px] text-ink-200 hover:border-ink-600"
          >
            View the published site
          </Link>
        </div>
      </footer>
    </main>
  );
}
