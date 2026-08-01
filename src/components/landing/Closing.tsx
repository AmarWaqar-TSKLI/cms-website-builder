import Link from "next/link";

const LINKS = [
  {
    href: "/dashboard",
    label: "Open the editor",
    note: "Drag components onto a canvas. Watch the JSON change as you do.",
    primary: true,
  },
  {
    href: "/walkthrough",
    label: "See it prove itself",
    note: "Publish, break the page, roll back — with the database visible the whole time.",
    primary: false,
  },
  {
    href: "/s/acme-store",
    label: "View a published site",
    note: "A real release being served from its artifact.",
    primary: false,
  },
];

export default function Closing() {
  return (
    <footer data-beat="09" className="mx-auto w-full max-w-5xl px-6 pt-16 pb-20">
      <h2 className="max-w-2xl text-3xl leading-[1.08] font-semibold tracking-tight text-ink-100 sm:text-4xl">
        None of this is a diagram.
      </h2>
      <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-400">
        The editor, the build worker, the release log and the rollback all run here, now.
      </p>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={[
              "group flex min-w-0 flex-col justify-between rounded-[14px] border p-5 transition-colors duration-200",
              l.primary
                ? "border-flux-500 bg-flux-500 hover:bg-flux-400"
                : "border-ink-700 bg-ink-900 hover:border-ink-600 hover:bg-ink-850",
            ].join(" ")}
          >
            <span
              className={[
                "flex items-center gap-2 text-[15px] font-semibold tracking-tight",
                l.primary ? "text-ink-950" : "text-ink-100",
              ].join(" ")}
            >
              {l.label}
              <span
                aria-hidden
                className="translate-x-0 transition-transform duration-200 group-hover:translate-x-1"
              >
                →
              </span>
            </span>
            <span
              className={[
                "mt-6 text-[13px] leading-relaxed",
                l.primary ? "text-ink-950/70" : "text-ink-400",
              ].join(" ")}
            >
              {l.note}
            </span>
            <span
              className={[
                "mono-xs mt-4",
                l.primary ? "text-ink-950/55" : "text-ink-600",
              ].join(" ")}
            >
              {l.href}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-16 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-800 pt-8">
        <p className="mono-xs text-ink-500">
          Architecture demo — every claim on this page is enforced by a passing test.
        </p>
      </div>
    </footer>
  );
}
