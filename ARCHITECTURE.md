# Architecture

A multi-tenant website builder where **a published page is an immutable snapshot,
not a file**. This document is the map; the load-bearing decisions have their own
short write-ups in [`docs/adr/`](docs/adr/).

> Honesty note: this is a working product with a strong core and demo-depth edges.
> The [Known limitations](#known-limitations) section is deliberately blunt about
> what is *not* production-ready. Read it.

---

## The one idea everything hangs off

**A page has no content column.** A page is identity only (path, title). What it
*is* at any moment lives in two other places:

- a **draft** (mutable, exactly one row per page/component) — what you're editing;
- **revisions** (append-only, one row per publish) — every version that ever went live.

Publishing doesn't render anything. It writes a **release**: a manifest pinning
exactly which revision of which page/component/theme belongs to this version. An
old release never needs rebuilding because it points at rows that can never change.

Serving is then two lookups with opposite treatments:

1. **Which release is a site serving?** → `sites.live_release_id`. One string,
   mutable, read fresh on every request.
2. **What's in that release?** → large, **immutable**, cached forever, never invalidated.

That asymmetry is the whole thing. **Rollback is `UPDATE sites SET live_release_id = <older>`** —
no purge, no rebuild, no cache warming. The old version was never evicted. See
[ADR-0003](docs/adr/0003-immutable-releases.md).

---

## The two tiers

| Tier | Examples | Versioned? | Why |
|------|----------|-----------|-----|
| **Engine** | pages, components, themes, releases | **Yes** | Design is what you roll back |
| **Modules** | products, orders, customers, posts, form submissions | **No** | Rolling back a homepage must not un-place an order |

Exactly **one** column crosses the boundary: `sites.live_release_id`. Tier-2 data a
release references (product titles, prices) is *frozen* into `release_data` at
publish time, so rendering a release stays a pure function of immutable rows.
See [ADR-0002](docs/adr/0002-two-tier-model.md).

---

## Storage: every block is a component

A page body is **not** a tree of blocks. It's an ordered list of **references** to
component records; each component holds its own tree. Drop a Hero on a page → a
component row is created and the page gains one reference. A component referenced
by five pages *is* a shared header; referenced by one, it's an ordinary block.
Same record, different fan-out. Node ids inside a component are **stable**, which
is what makes branch diff/merge and translation possible.
See [ADR-0004](docs/adr/0004-block-is-a-component.md).

---

## Rendering: one component, two consumers

`SiteBody` (blocks + chrome) is rendered by **both**:

- the **runtime** — as a React Server Component, streamed to visitors (ships ~no JS);
- the **export/worker** — via `renderToStaticMarkup`, written to a file.

Two renderers "agreeing" is a promise nobody can keep; one component rendered
twice is a fact. The boundary is enforced at build time: `react-dom/server` must
never enter the RSC graph, so anything that imports it is worker-only — or loads
it via a dynamic `import()` (see `src/lib/export-next.ts`, and the CI note below).

Blocks are `{ type, props }` resolved through a **registry**. A block's schema
drives three systems from one declaration: the editor's properties panel,
dependency extraction at publish, and the delete-safety warnings. The AI writes
the same `{type, props}` and is validated against the registry, so **it can only
ever emit valid blocks — never raw HTML or injection.**
See [ADR-0005](docs/adr/0005-registry-constrained-rendering.md).

---

## Bring-your-own-domain

Two independent, env-gated paths (see [ADR-0006](docs/adr/0006-domains-and-tls.md)):

- **Manual A-record** → point a domain at our TLS edge (a Caddy VM doing
  on-demand TLS, gated by `/api/domains/check`, proxying to the app).
- **Managed DNS** (the Vercel model) → the customer delegates their nameservers to
  our own authoritative DNS (PowerDNS), and we manage every record + certificate.

Serving a custom domain is just `siteByHost(host)` matching the `Host` header
against `sites.custom_domain`. No per-domain rebuild; publish/rollback are the
same pointer flip.

---

## Feature surface (all built on the above)

- **Branches** — fork a site, block-level diff against the parent (matched by
  stable node id), cherry-pick merge back as one release. **A branch forks the
  design only** — pages, components, theme. Tier-2 (products, media, posts,
  orders) is a single store shared with the parent, resolved via
  `src/lib/store-site.ts`: the same rule as rollback (reverting a design must
  not touch live business data), applied in the other direction. The diff is
  therefore a *design* diff, and says so when it's empty.
- **AI suite** — add section, rewrite page, whole-site rebrand (+3 directions),
  agentic "suggest what to add", and **translate** (multi-locale). All
  registry/id-bounded; all one atomic release; all one-click rollback.
- **Headless Content API** — `GET /api/v1/sites/<slug>/content` behind a hashed,
  site-scoped read key; served off the immutable release (so it's cacheable and
  rolls back with the site).
- **Export** — `static` (verbatim artifact), `container` (nginx bundle), and
  `nextjs` (a real, buildable Next.js + TypeScript source project).

---

## Testing

- **Unit** (`tests/unit`, `npm run test:unit`) — pure logic: registry, refs,
  href/basePath, theme-security (XSS sink), content-API serialization + key
  crypto, locale helpers. No DB. **These run in CI.**
- **Integration** (`tests/integration`, `npm run test:integration`) — real
  Postgres + the build worker + a running app (`requireApp`): publish, rollback,
  autosave, the static cart, worker builds. Wired as a **manual** workflow
  (`.github/workflows/integration.yml`, `workflow_dispatch`: Postgres service →
  migrate → build → start app + worker → run the suite). It's manual, not a push
  gate, until it's been observed green in CI — promote it by adding `push`
  triggers once it has.

CI (`.github/workflows/ci.yml`) gates every push on **typecheck + unit + build**.

---

## Known limitations

Being explicit so nobody has to discover these the hard way:

- **Single points of failure.** Custom-domain TLS and managed DNS both run on one
  VM; `ns1`/`ns2` resolve to the **same IP** (not real DNS redundancy). No DNSSEC,
  no secondary nameserver. The app is a single Railway service; the release cache
  is an in-process `Map` (safe only because releases are immutable — a second
  instance can't serve stale content, but the cache isn't shared).
- **Ops.** Deploys are manual (`railway up`); migrations applied by hand; no
  staging; monitoring is a `captureError` hook, not real alerting; no automated
  backups beyond the managed Postgres provider's own.
- **Content API.** Site-scoped keys only (no finer scopes), no usage metering, no
  OpenAPI spec. (ETag/`304` and single-page fetch *are* implemented.)
- **Multi-locale.** `hreflang`/`dir="rtl"`/locale-aware nav are implemented, but
  `hreflang` URLs are path-relative (absolute needs the request host), and
  per-instance text *overrides* on a page aren't translated.
- **Export to code.** Faithful (same renderer) but section internals are HTML
  strings via `dangerouslySetInnerHTML`, not hand-written JSX; interactivity (the
  cart) is intentionally dropped.
- **Integration tests are a manual CI workflow**, not yet a push gate (see
  Testing) — pending a first green run.

## What I'd do next, at scale

Move the TLS edge + DNS to a managed/redundant setup; put the release cache in
Redis/CDN keyed by release id (the design already assumes this); add CI-run
integration tests behind a Postgres service + ephemeral app; wire real monitoring
and automated migrations; add Content-API scopes + metering.
