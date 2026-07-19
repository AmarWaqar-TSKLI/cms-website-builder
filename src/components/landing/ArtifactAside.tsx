const TREE = [
  ["releases/rel_7f3a91c4/", "text-ink-200"],
  ["  index.html", "text-ink-400"],
  ["  about/index.html", "text-ink-400"],
  ["  products/index.html", "text-ink-400"],
  ["  assets/theme.css", "text-ink-400"],
  ["  manifest.json", "text-ink-400"],
] as const;

/** What "publish" leaves behind: a directory, not a boolean. */
export default function ArtifactAside() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="panel p-5">
        <div className="mono-xs tracking-[0.16em] text-ink-500 uppercase">a flag</div>
        <pre className="mt-4 overflow-x-auto font-mono text-[12px] leading-relaxed text-ink-400">
          <code>
            <span className="text-ink-500">UPDATE</span> pages{"\n"}
            <span className="text-ink-500">SET</span> is_published ={" "}
            <span className="text-fail-500">true</span>;
          </code>
        </pre>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-400">
          The site now exists only where that boolean is readable. You cannot hand it to anyone,
          diff it, archive it, or serve it from a machine that has never heard of your database.
        </p>
      </div>

      <div className="panel p-5">
        <div className="mono-xs tracking-[0.16em] text-ink-500 uppercase">an artifact</div>
        <pre className="mt-4 overflow-x-auto font-mono text-[12px] leading-relaxed">
          <code>
            {TREE.map(([line, cls]) => (
              <span key={line} className={cls}>
                {line}
                {"\n"}
              </span>
            ))}
          </code>
        </pre>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-400">
          Finished files with a content hash. Copyable, diffable, archivable, and serveable by
          anything that can read a directory.
        </p>
      </div>
    </div>
  );
}
