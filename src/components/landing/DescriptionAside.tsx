import type { ReactNode } from "react";

const K = ({ children }: { children: ReactNode }) => (
  <span className="text-flux-300">{children}</span>
);
const S = ({ children }: { children: ReactNode }) => (
  <span className="text-live-500">{children}</span>
);
const P = ({ children }: { children: ReactNode }) => (
  <span className="text-ink-500">{children}</span>
);

function Card({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="panel flex min-w-0 flex-col p-4 sm:p-5">
      <div className="mono-xs flex items-baseline justify-between gap-3 text-ink-500 uppercase">
        <span className="tracking-[0.16em]">{label}</span>
        <span className="text-ink-600 normal-case">{note}</span>
      </div>
      <div className="mt-4 min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** The three places a page lives, and the fact that only one of them is data. */
export default function DescriptionAside() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card label="the database" note="pages.draft_json">
        <pre className="overflow-x-auto font-mono text-[11.5px] leading-[1.75] text-ink-300">
          <code>
            {`{`}
            <K>{`"type"`}</K>
            <P>:</P>
            <S>{`"Hero"`}</S>
            <P>,</P>
            {`\n `}
            <K>{`"props"`}</K>
            <P>:</P>
            {` {`}
            <K>{`"headline"`}</K>
            <P>:</P>
            <S>{`"Summer Sale"`}</S>
            {`},`}
            {`\n `}
            <K>{`"children"`}</K>
            <P>:</P>
            {` []`}
            {`}`}
          </code>
        </pre>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-400">
          The literal column value is{" "}
          <span className="font-mono text-[11.5px] text-ink-300">
            {`{"type":"Hero","props":{"headline":"Summer Sale"},"children":[]}`}
          </span>
          . No tags. No classes. No markup of any kind.
        </p>
      </Card>

      <Card label="the registry" note="src/lib/registry">
        <pre className="overflow-x-auto font-mono text-[11.5px] leading-[1.9] text-ink-300">
          <code>
            <S>{`"Hero"`}</S> <P>→</P> Hero{"\n"}
            <S>{`"TextBlock"`}</S> <P>→</P> TextBlock{"\n"}
            <S>{`"Button"`}</S> <P>→</P> Button{"\n"}
            <S>{`"ImageBlock"`}</S> <P>→</P> ImageBlock{"\n"}
            <S>{`"ProductGrid"`}</S> <P>→</P> ProductGrid{"\n"}
            <S>{`"Spacer"`}</S> <P>→</P> Spacer
          </code>
        </pre>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-400">
          One table maps a name to a real component and its prop schema. The editor palette, the
          canvas and the build worker all resolve through this same table, which is why the preview
          and the artifact cannot disagree.
        </p>
      </Card>

      <Card label="the codebase" note="typed, tested, deployed">
        <pre className="overflow-x-auto font-mono text-[11.5px] leading-[1.75] text-ink-300">
          <code>
            <P>function</P> Hero<P>(</P>
            {`{ headline }`}
            <P>)</P> {`{`}
            {"\n  "}
            <P>return</P> {`<section …>`}
            {"\n    "}
            {`<h1>`}
            {`{headline}`}
            {`</h1>`}
            {"\n  "}
            {`</section>`}
            {"\n"}
            {`}`}
          </code>
        </pre>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-400">
          Component code ships with the app, not with the row. Fix the markup once and every page
          that names <span className="font-mono text-[11.5px] text-ink-300">&quot;Hero&quot;</span>{" "}
          gets the fix on its next build. Stored HTML would have frozen the bug into every row that
          ever used it.
        </p>
      </Card>
    </div>
  );
}
