# Decisions

Two kinds of entry: **D1–D9** are the architecture, each forced by the one
before it. **I1–I14** are implementation choices the brief left open, recorded
here with what they cost.

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

### D3 — Per-page revisions, not per-component

A revision holds the whole tree.

*Why forced:* the arrangement — which blocks, in what order — is itself the
information worth keeping. Reconstructing a page from independently-versioned
components means reassembling an arrangement from parts, which is exactly the
class of problem append-only exists to delete. Storage is free; correctness
isn't.

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

### D7 — Artifacts are immutable

An old release is never rebuilt. Build once, store forever, serve by pointer.

*Why forced:* if an artifact could change, "roll back to v3" would mean "rebuild
something we hope resembles v3". Immutability is what makes the pointer swap
trustworthy. Retrying a *succeeded* release returns 409.

### D8 — Static ≠ no JavaScript

Static means no server rendered the page. A static page's JS calls the runtime
API for cart and checkout. The line is "does a visitor cause a change", not
"does anything change".

*Proved by test:* checksum the HTML file, place an order through the artifact's
own inline script, checksum again — identical, while `orders` gains a row.

### D9 — Hosting is the product; export is the escape hatch

The same artifact reaches a hosted URL, a static zip, and a container bundle.
Export copies files; it never re-renders. "Runs anywhere" is a capability we
guarantee, not an obligation we push onto the user.

---

## Implementation decisions

### I1 — Artifacts are real HTML files on disk

*Chosen over:* a JSON bundle rendered client-side.

A JSON bundle re-renders at request time, which quietly contradicts D7 and
non-negotiable #7. Files on disk can be checksummed, diffed, and read by a
human. `artifacts/` is a bind mount rather than a Docker named volume
specifically so you can open the folder and look.

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

### I8 — `serve.ts` imports from `paths.ts`, never `build.ts`

The serving path needs to know *where* artifacts live; it must not be able to
reach the code that *makes* them. Splitting the three path helpers into their
own React-free module means the module graph itself enforces non-negotiable #7.

`make verify` check 7 greps `serve.ts` for an import of the renderer or the
builder, so this stays true after future edits. (Next.js caught the original
violation first, by refusing to bundle `react-dom/server` into a route.)

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
- **Per-component versioning.** See D3.
- **Rebuilding on rollback.** Contradicts D7, and makes rollback slow and
  fallible exactly when you need it fast and certain.
- **Versioning products so pages never break.** Fixes a rendering edge case by
  making orders and inventory time-travel. Strictly worse.
- **Blog module.** Schema is present (`posts`, `post_revisions`, `tags`,
  `post_tags`); no UI. Commerce was built fully first because it is what proves
  D8 and D5. Blog mostly re-demonstrates versioning already shown.
