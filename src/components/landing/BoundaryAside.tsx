const VERSIONED = [
  ["pages", "one row per route"],
  ["page_revisions", "every saved edit"],
  ["themes", "tokens, fonts, spacing"],
  ["theme_revisions", "every theme change"],
  ["releases", "one row per publish"],
  ["release_items", "the frozen node tree"],
];

const LIVE = [
  ["products", "price, stock, status"],
  ["product_variants", "sku level truth"],
  ["orders", "money that changed hands"],
  ["order_line_items", "what was actually bought"],
  ["customers", "people, not content"],
  ["media", "uploaded bytes"],
];

function Column({
  title,
  verdict,
  accent,
  rows,
}: {
  title: string;
  verdict: string;
  accent: string;
  rows: string[][];
}) {
  return (
    <div className="panel min-w-0 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-ink-100">{title}</h3>
        <span className={`mono-xs ${accent}`}>{verdict}</span>
      </div>
      <ul className="mt-4 space-y-2.5">
        {rows.map(([table, note]) => (
          <li key={table} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="font-mono text-[12px] text-ink-200">{table}</span>
            <span className="text-[12px] text-ink-500">{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Two clocks in one database, and the single column that crosses between them. */
export default function BoundaryAside() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
      <Column
        title="Versioned appearance"
        verdict="rolls back"
        accent="text-flux-400"
        rows={VERSIONED}
      />

      <div className="flex items-center justify-center gap-3 py-2 lg:h-full lg:flex-col lg:py-0">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-ink-700 to-transparent lg:h-full lg:w-px lg:bg-gradient-to-b" />
        <span className="mono-xs shrink-0 rounded-full border border-ink-700 bg-ink-900 px-3 py-1.5 text-center text-ink-300">
          sites.live_release_id
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-ink-700 to-transparent lg:h-full lg:w-px lg:bg-gradient-to-b" />
      </div>

      <Column
        title="Live business data"
        verdict="never rolls back"
        accent="text-live-500"
        rows={LIVE}
      />
    </div>
  );
}
