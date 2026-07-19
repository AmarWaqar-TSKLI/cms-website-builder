import { Beat, Code, Reveal, Therefore } from "@/components/landing/Chain";
import ArtifactAside from "@/components/landing/ArtifactAside";
import BoundaryAside from "@/components/landing/BoundaryAside";
import Closing from "@/components/landing/Closing";
import DescriptionAside from "@/components/landing/DescriptionAside";
import Hero from "@/components/landing/Hero";
import ReleaseStack from "@/components/landing/ReleaseStack";
import TargetsAside from "@/components/landing/TargetsAside";

/**
 * The landing page is the argument, in order. Every section below is forced by
 * the one above it — the "therefore" between them is not decoration, it is the
 * claim that you could not have made the previous decision and then declined
 * this one.
 */
export default function LandingPage() {
  return (
    <main className="relative w-full overflow-x-clip">
      <Hero />

      <div className="pt-24 sm:pt-32">
        <Beat
          n="01"
          label="the premise"
          title={
            <>
              A site should not be trapped
              <br className="hidden sm:block" /> on the server that built it.
            </>
          }
        >
          <p>
            Most CMS platforms answer &ldquo;where does your site live?&rdquo; with{" "}
            <span className="text-ink-200">here, with us</span>. The pages exist as rows that only
            our renderer understands, so leaving means rebuilding.
          </p>
          <p>
            Start from the opposite requirement: whatever we publish has to be runnable by someone
            who has never heard of this application. Every decision after this one is a consequence
            of refusing to compromise on that.
          </p>
        </Beat>
      </div>

      <Therefore>
        If the output must run elsewhere, then publishing cannot be a state change in our database.
      </Therefore>

      <Beat
        n="02"
        label="publish"
        title="Publish produces a package, not a flag."
        aside={<ArtifactAside />}
      >
        <p>
          <Code>is_published = true</Code> creates nothing. It marks a row and leaves the site
          dependent on the process that reads that row.
        </p>
        <p>
          A release is a real thing: a set of rendered files, a manifest, a content hash, an
          immutable id. It was correct the moment it was written and it stays correct, because
          nothing about it is recomputed later.
        </p>
      </Beat>

      <Therefore>
        And if one publish must be able to become a hosted site, a zip, and a container, the thing
        being published cannot be shaped like any one of them.
      </Therefore>

      <Beat n="03" label="compilation" title="One source. Several targets.">
        <p>
          The stored form has to be neutral — closer to an AST than to a document. Then publishing
          is compilation: read the source once, emit each target from it.
        </p>
        <p>
          If the source were HTML, it would already have chosen a target. It would carry class
          names for a stylesheet the zip does not have, and absolute URLs the container will never
          resolve.
        </p>
        <Reveal>
          <div className="mono-xs mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-ink-500">
            <span className="rounded border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-ink-200">
              description
            </span>
            <span aria-hidden>→</span>
            <span className="rounded border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-ink-300">
              build worker
            </span>
            <span aria-hidden>→</span>
            <span className="rounded border border-flux-500/40 bg-flux-500/10 px-2.5 py-1.5 text-flux-300">
              html · css · assets
            </span>
          </div>
        </Reveal>
      </Beat>

      <Therefore>
        A neutral source that compiles is not markup. It is a description of what the page is.
      </Therefore>

      <Beat
        n="04"
        label="the model"
        title={
          <>
            Store a description.
            <br className="hidden sm:block" /> Never store HTML.
          </>
        }
        aside={<DescriptionAside />}
      >
        <p>
          A page is a tree of <Code>{"{ type, props, children }"}</Code>. That is the whole schema.
          The database holds names and values; the components those names refer to live in the
          codebase, versioned and tested like any other code.
        </p>
        <p>
          A registry joins the two. It is the reason the same tree can render into the editor
          canvas, into a hosted route, and into a file that opens from a USB stick.
        </p>
      </Beat>

      <Therefore>
        A description is kilobytes. Keeping all of them is cheaper than deciding which to throw
        away.
      </Therefore>

      <ReleaseStack />

      <div className="pt-24 sm:pt-32" />

      <Therefore>
        But an order is not a headline. Rolling everything back would undo things that were never
        anyone&rsquo;s mistake.
      </Therefore>

      <Beat
        n="07"
        label="the boundary"
        title="Two clocks in one database."
        aside={<BoundaryAside />}
      >
        <p>
          Appearance is versioned: pages, themes, releases and their revisions all move backwards on
          command. Business data is not: products, orders and customers only ever move forward.
        </p>
        <p>
          Roll back a headline and you have fixed a mistake. Roll back an order and you have
          destroyed a fact. So they are kept on separate clocks, and exactly one column is allowed
          to cross between them.
        </p>
      </Beat>

      <Therefore>
        With the boundary drawn, a release id is a complete and safe description of a site&rsquo;s
        appearance — enough to build from, anywhere.
      </Therefore>

      <Beat
        n="08"
        label="destinations"
        title="One build. Three destinations."
        aside={<TargetsAside />}
      >
        <p>
          The same release id serves a live URL, fills a zip, and populates a container image.
          Nothing is re-derived per target; each writer takes the finished tree and puts it
          somewhere.
        </p>
        <p>
          This is what the first requirement bought. The site runs on our servers because that is
          convenient, not because it has to.
        </p>
      </Beat>

      <div className="pt-28 sm:pt-40" />
      <Closing />
    </main>
  );
}
