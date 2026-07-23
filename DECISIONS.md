# Decisions

Two kinds of entry: **D1–D11** are the architecture, each forced by the one
before it. **I1–I15** are implementation choices the brief left open, recorded
here with what they cost.

Where a decision was later overturned, the original is kept and amended rather
than rewritten — D3 and D7 both say what they used to claim and why that changed.
An architecture document that quietly edits its own history is worth very little.

---

## The chain

Every link below is a consequence, not a preference. If you accept the first
sentence, you are pushed into all of them.

### D1 — Store a description, not HTML

A page body is a JSON tree of `{type, props, children}`. The component *code*
lives in the codebase; the database stores a name string and some values. A
registry maps `"Hero"` to the real component.

*Why forced:* HTML is already a compilation target. Storing it picks the
destination before you know what the destination is, which forfeits
portability — the one requirement everything else exists to serve.

*Payoffs:* multiple compile targets, versions that cost kilobytes, an editor
that needs no server round-trip to re-render.

### D2 — Append-only

Every meaningful save is a new row. Nothing is updated, nothing is deleted.
Rollback becomes `UPDATE sites SET live_release_id = …`.

The split that makes this work:

| | `page_drafts` | `page_revisions` |
|---|---|---|
| when | autosave, ~2s | publish |
| behaviour | **overwritten**, one row per page | **appended**, grows forever |
| purpose | crash protection | permanent history |

*Why forced:* descriptions are small (D1), so keeping all of them costs almost
nothing next to the value of returning to a state that worked. And keystrokes
are not history — a version per keypress produces 4,000 versions and no way to
find the one that mattered.

*Enforced by:* database triggers, not convention. `UPDATE`/`DELETE` on
`page_revisions`, `theme_revisions` and `release_items` raise. `page_drafts`
has `page_id` as its PRIMARY KEY, so "one draft per page" is structural.

### D3 — Per-page revisions, not per-node

A page revision holds the whole tree.

*Why forced:* the arrangement — which blocks, in what order — is itself the
information worth keeping. Reconstructing a page from independently-versioned
nodes means reassembling an arrangement from parts, which is exactly the
class of problem append-only exists to delete. Storage is free; correctness
isn't.

*Amended by D10.* This decision was originally written as "not per-component",
which turned out to be one word doing two jobs. Storing every *node* as its own
versioned row is still refused, and `make verify` check 4 enforces it. Storing a
shared *definition* — a header used by forty pages — as its own versioned entity
is a different thing entirely, and D10 adopts it. The line is: nothing is ever
keyed by a node's position in a page.

### D4 — Publish is two jobs

**Snapshot** (milliseconds, one transaction, cannot fail) then **Build** (slow,
background, can fail).

*Why forced:* building can fail — a component throws, a disk fills, a process
is killed. If publish were one job, a build failure would leave a half-published
site. Split, a failure is a non-event: the snapshot is committed, the previous
artifact keeps serving, and a retry is the same job again.

*Also:* the snapshot is site-wide. A "version" where page A is new and page B is
old is not a version of anything anyone can reason about.

### D5 — Versioned vs. live

Versioned: pages, revisions, themes, releases. Live: products, orders, posts,
customers. Rollback touches only the versioned side. Exactly one column
crosses: `sites.live_release_id`.

*Why forced:* reverting a homepage design must not un-place yesterday's orders.

*Accepted cost:* a frozen page can reference live data that has since been
deleted. This is made **visible**, not impossible — via `release_dependencies`
(the reverse index), soft deletes, and components that degrade to a placeholder
instead of throwing. Pretending otherwise would mean either versioning orders
or forbidding deletes, and both are worse.

### D6 — Three tiers

Engine (no business concepts, fully versioned) / Modules (blog, commerce, forms
— opt-in, fully live) / Components (palette filtered by enabled modules).
WordPress is engine + blog. Shopify is engine + commerce.

### D7 — Releases are immutable

An old release is never rebuilt and its inputs can never change. Snapshot once,
serve by pointer.

*Why forced:* if a release could change, "roll back to v3" would mean "rebuild
something we hope resembles v3". Immutability is what makes the pointer swap
trustworthy. Retrying a *succeeded* release returns 409.

*Amended by D11.* This was originally "artifacts are immutable", where an
artifact meant an HTML file. Hosting now renders on demand, so immutability
moved one level down to where it was always really needed: the release's
INPUTS. Every one of them - page revisions, component revisions, the theme
revision, and the frozen Tier-2 data in `release_data` - is append-only and
trigger-guarded. The testable form of the property changed accordingly, from
"nobody rewrote the file" to "rendering it twice produces the same bytes".

### D8 — Static ≠ no JavaScript

Static means no server rendered the page. A static page's JS calls the runtime
API for cart and checkout. The line is "does a visitor cause a change", not
"does anything change".

*Proved by test:* serve the page, place a real order, serve it again — byte for
byte identical, while `orders` gains a row and stock drops. On the hosted
runtime the cart is a React client island; in an exported artifact it is a
vanilla script bound to the same `data-cms-add-to-cart` attributes, emitted by
the same component. One contract, two hosts.

### D9 — Hosting is the product; export is the escape hatch

The same release reaches a hosted URL, a static zip, and a container bundle.
"Runs anywhere" is a capability we guarantee, not an obligation we push onto
the user.

### D11 — Hosting is a multi-tenant runtime, not a folder of files

A published page is rendered on demand by one Next.js app, from the release the
site points at. Prerendered files still exist, but only so the export has
something to zip; hosting never opens them.

*Why:* the previous design served a static file per page. That is genuinely
fast and genuinely limiting. It meant every interactive element was hand-written
vanilla JavaScript inside a template literal; it meant hosting was pinned to a
filesystem, so a second app server needed a shared volume; and it meant the
escape hatch was a folder of HTML rather than something a developer could
extend.

*Why NOT `next build` per site per publish:* that is the obvious reading of
"deploy a Next.js build", and it is the expensive one. A build is 30-90 seconds
and roughly a CPU-minute. At ten thousand sites publishing three times a day it
becomes the dominant cost in the system, and it turns publish-to-live from about
a second into about a minute. Worse, if "deploy" means starting a server per
site, rollback stops being a pointer swap and becomes an orchestration event.
The framework is worth having. Paying for it on the publish path is not.

*What makes it safe, and this is the line worth repeating:*

> A release is immutable, so `(releaseId, path)` is a **content-addressed**
> cache key. It never needs invalidation. Publishing writes a new key; rolling
> back reads an old key that is still warm.

Everything follows from that. There is no purge on publish. There is no cold
cache after a rollback. There is no cross-server invalidation protocol, because
two servers holding the same key cannot disagree about what it means. Compare a
CMS that caches rendered pages by URL: it must purge on every publish, purge
again to roll back, and both costs grow with the size of the site.

*What it forced:* Tier-2 data had to be frozen into the release (`release_data`)
rather than resolved at render time. Without that, the same release would render
today's prices, the output would depend on when you asked, and every claim about
determinism and rollback would quietly become false.

*Accepted cost:* the request path now renders instead of reading bytes, so it is
no longer *impossible* for it to see live state, only *prevented*. The old
guarantee was structural: "this module cannot import a renderer". The new one is
a smaller structural claim plus a behavioural test - the runtime touches no
draft table, cannot reach `react-dom/server` (Next enforces that at build time),
and `make verify` rewrites a draft then asserts the live page is byte-identical.

*Accepted cost:* Next streams RSC payloads and splits them across `<script>`
tags at boundaries that depend on server timing, so two renders can differ by a
few dozen bytes of transport framing while the document itself is identical.
Byte-identity is therefore asserted about the document with that transport
stripped. Warming each path after a publish removes the difference in practice;
the normalisation exists so the test asserts something true rather than
something lucky.

---

### D10 — Reuse is a reference to a shared definition, never a copy

A page node may be `{type: "@component", props: {componentId, overrides}}`. The
definition lives in `shared_components` with the same draft/revision pair pages
have. Publish pins the *revision*.

*Why forced:* without it, a header exists forty times, and changing it is forty
edits that can each go wrong. That is not a convenience problem — it is the same
correctness problem as storing HTML, one level up. The page should describe what
it wants, not carry a copy of it.

*Why a reference and not a copy at publish time:* flattening symbols into each
page revision at publish would make every page revision self-contained, which is
tempting. It also means "what changed in v12?" answers with forty modified pages
when one header moved, and it doubles the stored bytes for every instance. A
reference plus a pinned revision keeps both the diff and the storage honest.

*What it costs:* rendering a page is no longer a single lookup. The renderer must
expand references, detect cycles, and rewrite node ids so two instances of one
symbol don't collide. All three live in `src/lib/shared-components.ts`, are pure
functions over trees, and are the same code the editor canvas runs — because the
moment those diverge, the canvas stops predicting the artifact.

*Why pin the revision and not the component:* pinning the component would make
rollback a lie. You would restore v1's pages and they would render today's
header. Because `release_items.revision_id` was already polymorphic (I6), this
cost exactly one enum value.

*Why publish every symbol, not just used ones:* publish is site-wide (D4). A
release where the header is new and the footer is old is not a version of
anything anyone can reason about.

*Accepted cost:* an instance's overrides are keyed by node id inside the symbol.
Delete that node from the symbol and the override is silently dropped. The
alternative — keeping orphaned overrides forever in case the node returns — is
worse, and there is a test asserting the drop is deliberate.

*Escape hatch:* Detach. One page needing a slightly different header replaces the
instance with ordinary blocks it owns, overrides baked in. Adopting reuse should
never be a one-way door.

## Implementation decisions

### I1 — Prerendered files still exist, for the export

*Chosen over:* deleting them once hosting stopped reading them.

They are what the static zip and the container bundle are made of, and they are
the most direct way to see that a release is a real, complete, inspectable
thing. `artifacts/` is a bind mount rather than a Docker named volume
specifically so you can open the folder and look. `make verify` check 12 deletes
the live release's directory mid-run to prove hosting does not depend on it.

### I2 — The build worker is a separate OS process

*Chosen over:* an in-process async job.

In-process, "publish returns before the build finishes" is a property of how
you measured rather than of the system. Separate, you can
`docker compose kill worker` mid-build and watch the release stay non-live
while the old artifact keeps serving.

Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so running several workers is
safe and no job is handed out twice.

### I3 — References come from prop schemas

*Chosen over:* inferring references from the JSONB.

Each component declares `kind: "ref", ref: "collection"`. That single
declaration drives three systems: the properties-panel widget, the
`release_dependencies` rows, and the "3 live releases use this" delete warning.

Inference would have been the one dishonest seam. There is a test that puts
`col_1 media_1 <uuid>` inside a TextBlock's prose and asserts **zero**
dependencies are extracted — a regex-based extractor fails it.

Collections fan out to their products, because a product's title and price get
frozen into the artifact even though no prop names it directly.

### I4 — Components use inline styles, not Tailwind

The app chrome uses Tailwind. Published components do not.

*Why:* an exported zip must render correctly with no CSS build step, from
`file://`, with no network. Tailwind classes in an artifact would need a
compiled stylesheet shipped alongside and correctly linked. Inline styles
driven by theme tokens make the artifact genuinely self-contained, which is the
concrete test of D9.

*Cost:* components are more verbose, and there is no utility-class ergonomics
inside them. Worth it — self-containment is the claim being made.

### I5 — Site chrome lives in the theme, not in components

`theme_revisions.layout` holds `{nav, footer}` as structured data rendered
directly by the renderer.

*Why:* the brief specifies exactly six components and says to keep the set
small. Adding `SiteHeader`/`SiteFooter` would have grown the palette for
something that is not page content. As a bonus the chrome is versioned, so
changing the brand name and rolling back visibly restores the old one.

### I6 — `release_items.revision_id` carries no foreign key

It is polymorphic: it points at `page_revisions` when `entity_type='page'` and
`theme_revisions` when `'theme'`. One column cannot reference two tables.

Integrity comes from the append-only triggers instead: neither target can ever
be deleted, so the reference cannot dangle. (Prisma initially generated an FK
here and it failed on the first theme insert — the fix was removing it, not
working around it.)

### I7 — The partial unique index is raw SQL

`UNIQUE(site_id, path) WHERE deleted_at IS NULL` has no Prisma schema syntax,
so it is appended to the migration by hand. Without the `WHERE`, a soft-deleted
page would keep reserving its path forever.

### I8 — `render/index.tsx` renders components; `render/html.tsx` makes documents

The runtime turns a description into React. Only the export turns React into an
HTML string, and `react-dom/server` lives exclusively in `render/html.tsx`.

Next enforces the boundary for free: importing `react-dom/server` anywhere
reachable from a Server Component fails the build. It caught the violation
twice - first when `serve.ts` transitively imported the renderer, and again when
the runtime page imported it through `SiteBody`.

This is the successor to the old rule that `serve.ts` could not import a
renderer. The mechanism had to change when serving became rendering; the intent
did not, and `make verify` check 7 now asserts both halves - no document
renderer in the request path, and no draft table either.

### I15 — Two root layouts, one per audience

`app/(app)/layout.tsx` imports Tailwind and the product's fonts.
`app/(site)/layout.tsx` imports nothing at all.

A published site must not inherit the builder's CSS reset, fonts or utility
classes - a visitor should get exactly what that site's theme describes and
nothing else. Next supports this through route groups with separate root
layouts, which is why every product route moved under `(app)`.

### I9 — Custom domain routing is edge middleware + a Node route

Middleware does no database work — it only decides "this Host isn't the app's
own" and rewrites to `/site-by-host/<domain>`, where an ordinary route does the
`sites.custom_domain` lookup. That keeps the middleware on the edge runtime.

`?host=acme.test` forces the same path locally. The mechanism is real; DNS and
SSL are out of scope.

*Gotcha worth recording:* the route was originally at `/_host/…`. App Router
treats underscore-prefixed folders as private and silently never routes to
them, which looked exactly like a broken domain lookup.

### I10 — The crash-safety test uses a data-driven failure

*Chosen over:* an environment flag telling the worker to throw.

Page `/a` writes `a/index.html`; page `/a/index.html` needs `a/index.html` to be
a directory. Whichever order the worker renders them in, one write raises. It is
a genuine build failure caused by content, so it fails identically for any
worker rather than only for one the test configured.

`BUILD_FAIL_ON_PATH` still exists for driving the failure by hand during a demo.

### I11 — `make test` stops the worker container

The worker tests start and stop the real worker process themselves. A second
worker polling the same queue makes "who claimed this job" nondeterministic, so
the container stands down for the duration and is restarted afterwards.

### I12 — Auth is faked, deliberately and visibly

One seeded user, a cookie that is read but never verified, no login UI, and a
`password_hash` of the literal string `seeded-no-login-ui`. Out of scope in the
brief; listed in the README's "what's faked".

### I13 — Media and product images are inline SVG data URIs

There is no S3, no upload pipeline, no image processing. The upside is not just
convenience: it is what lets an exported artifact opened from `file://` render
completely with no network at all.

### I14 — Prices are re-read from the database at checkout

The artifact's baked-in price is a display value that may be weeks stale. What
someone is charged is decided server-side, now. `price_at_purchase_cents` then
snapshots it onto the line item, so a later price change cannot rewrite what a
customer paid.

---

## Rejected

- **Mongo.** The page body is a JSONB document, but everything around it is
  relational and publish needs an atomic multi-row write across revisions,
  releases, items and dependencies.
- **Per-node versioning.** A row per block, with `parent_id`, `sort_order` and its
  own version lineage. "What did this page look like on Tuesday?" becomes a
  recursive query across N independently-versioned rows reconciled to a common
  point; reordering becomes a multi-row transaction with fractional indices; and
  rollback stops being a pointer swap. See D3, and D10 for what was adopted
  instead.
- **Flattening shared components into each page revision at publish.** See D10.
- **Rebuilding on rollback.** Contradicts D7, and makes rollback slow and
  fallible exactly when you need it fast and certain.
- **`next build` per site on every publish.** See D11. Minutes and CPU-hours on
  the hot path, and it costs the pointer-swap rollback.
- **Caching rendered pages by URL.** Forces a purge on every publish and a
  second purge to roll back, both scaling with the size of the site. Keying on
  the immutable release id removes the need for either.
- **Resolving products at render time.** Would make a release render differently
  depending on when you asked, quietly falsifying D7. Frozen into `release_data`
  at build time instead.
- **Versioning products so pages never break.** Fixes a rendering edge case by
  making orders and inventory time-travel. Strictly worse.
- **Blog module.** Schema is present (`posts`, `post_revisions`, `tags`,
  `post_tags`); no UI. Commerce was built fully first because it is what proves
  D8 and D5. Blog mostly re-demonstrates versioning already shown.
