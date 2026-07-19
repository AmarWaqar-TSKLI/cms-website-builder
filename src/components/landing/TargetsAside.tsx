const TARGETS = [
  {
    name: "Hosted URL",
    detail: "/s/acme-store",
    body: "The app serves the release's files straight from disk. No render-time database read for the page structure.",
  },
  {
    name: "Static zip",
    detail: "acme-store-rel_7f3a91c4.zip",
    body: "The same files, archived. Opens from file:// with no server and no stylesheet — which is why published components carry inline styles.",
  },
  {
    name: "Container export",
    detail: "Dockerfile + nginx.conf",
    body: "The same files plus a web server config. Runs anywhere a container runs, including somewhere we will never see.",
  },
];

/** One release id, three destinations. Not three pipelines — three writers. */
export default function TargetsAside() {
  return (
    <div>
      <div className="mono-xs flex flex-wrap items-center gap-2 text-ink-500">
        <span>source of truth</span>
        <span aria-hidden>→</span>
        <span className="rounded border border-flux-500/40 bg-flux-500/10 px-2 py-1 text-flux-300">
          rel_7f3a91c4
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {TARGETS.map((t) => (
          <div key={t.name} className="panel flex min-w-0 flex-col p-5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-flux-500" aria-hidden />
              <h3 className="text-sm font-semibold tracking-tight text-ink-100">{t.name}</h3>
            </div>
            <p className="mono-xs mt-3 truncate text-ink-500">{t.detail}</p>
            <p className="mt-4 text-[13px] leading-relaxed text-ink-400">{t.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-[13px] leading-relaxed text-ink-500">
        The three writers share one input, so they cannot drift. If the zip is wrong, the hosted
        site is wrong too — and a test catches it before either ships.
      </p>
    </div>
  );
}
