# CMS Website Builder — architecture demo

A working WordPress/Shopify-style site builder that exists to prove one
architecture: **a page is a description, not a document.**

Two requirements pull in opposite directions — a site should *run anywhere*, and
it should have *version control with instant rollback*. Everything here follows
from taking both seriously.

```
  EDITOR (browser)                    Zustand — instant, zero network
     │  autosave every 2s
     ▼
  page_drafts              ── 1 row per page,      OVERWRITTEN
  shared_component_drafts  ── 1 row per component, OVERWRITTEN
     │        (a page stores a REFERENCE to a component, never a copy)
     │
     │  PUBLISH  ── one transaction, <200ms, returns now ──┐
     ▼                                                     │
  page_revisions             (APPEND) ┐                    │
  shared_component_revisions (APPEND) ┼→ releases → items  │
  theme_revisions            (APPEND) ┘                    ▼
                                                    build_jobs (queue)
                                                           │
                                            ┌──────────────┘
                                            ▼
                                    WORKER (separate process)
                                    ├─ freeze Tier-2 → release_data  ← makes the
                                    │                                  release a
                                    │                                  COMPLETE
                                    │                                  immutable input
                                    ├─ prerender files (for the export only)
                                    └─ flip sites.live_release_id, then warm
                                            │
     ┌──────────────────────────────────────┴───────────────────────────┐
     ▼                                                                  ▼
  RUNTIME  (multi-tenant Next.js)                              EXPORT (on demand)
  host/slug → live_release_id ─────┐                           static .zip
                                   │  ← ONE mutable value,     container image
                                   │    read fresh per request
  release id ──────────────────────┴─→ pages + components + frozen data
                                       IMMUTABLE → cached forever, never purged
                                          │
                                          ▼
                                   React Server Components
                                   (cart is the one client island)

  rollback = UPDATE sites SET live_release_id = <older>.  Nothing else moves:
  no purge, no rebuild, no warm — the old release's cache was never evicted.
```

---

## Run it

Requires Docker and Node 22+.

```bash
make demo          # POSIX
.\make.cmd demo    # Windows (no GNU make needed — same script)
```

That takes a clean checkout all the way to a verified, live system: builds
images, starts Postgres + app + worker, migrates, seeds, runs the test suite,
then runs the verification gate and prints the URLs.

| | |
|---|---|
| Landing film | http://localhost:3000/ |
| Dashboard | http://localhost:3000/dashboard |
| Walkthrough + live DB inspector | http://localhost:3000/walkthrough |
| Published site | http://localhost:3000/s/acme-store |
| Custom domain routing | http://localhost:3000/?host=acme.test |

Other commands: `make up`, `make down`, `make dev`, `make seed`, `make test`,
`make e2e`, `make verify`, `make reset`, `make logs`, `make clean`.

`make dev` runs the app and worker on the host (fast reload) against the
dockerised Postgres. `make up` runs everything in containers.

---

## The 60-second tour

1. **`/walkthrough`** → hit **Fire 10 autosaves**. `page_drafts` stays at 2 rows
   (one per page) while `lock_version` climbs to 11.
2. Hit **Publish**. The log records how long the snapshot took and that the job
   was still `queued` when the API answered. A second later the worker finishes.
   `page_revisions` grows by exactly one row per page.
3. Edit something in `/dashboard` → the editor → publish again.
4. Hit **Roll back one version**. The live site instantly serves the previous
   version. Nothing was rebuilt, no cache was purged, no file was written.
5. Open the live site, add something to the cart, check out. An order appears in
   `orders` and the page's bytes do not move.
6. In the editor, open **◈ Announcement bar** from the palette, change a word,
   and publish. Both `/` and `/about` change — neither page's draft was touched,
   because neither holds that text. Roll back and both return together.

---

## Verification

`make verify` runs a scripted walkthrough against the live stack and prints a
PASS/FAIL line for each of the twelve non-negotiables, exiting non-zero on any
failure.

| # | Non-negotiable | How it's proved |
|---|---|---|
| 1 | Never store HTML in the DB | Every stored body scanned for markup; bodies asserted to be `{type, props}` trees |
| 2 | `page_revisions` append-only | `UPDATE` and `DELETE` both rejected by a **database trigger** |
| 3 | `page_drafts` overwrite-only, one row per page | 10 autosaves → still 1 row; a second row rejected by the PRIMARY KEY |
| 4 | A revision holds the whole tree; nothing is stored per node | Ordered arrangement round-trips; publishing a 4-node page writes **1** revision row; no table is keyed by a node id or `sort_order` |
| 5 | Publish returns before the build finishes | Snapshot under 200ms with the job still `queued` |
| 6 | Rollback is a single-column update | Whole `sites` row diffed — exactly one column changed; 0 jobs queued, 0 files touched |
| 7 | The request path renders one immutable release and cannot see draft state | A draft is rewritten; the live page is byte-identical afterwards. No runtime module references a draft table or `react-dom/server` |
| 8 | Products/orders never versioned | No `*_revisions` table for Tier 2; an order survives a rollback |
| 9 | A release is immutable and renders deterministically | Two independent renders of one release are byte-identical; `release_data` rejects `UPDATE`; old files unchanged across a publish + 3 rollbacks; rebuilding a ready release returns 409 |
| 10 | Hosting default, export additive | Hosted URL, custom domain and both exports all resolve to the same release id |
| 11 | A shared component is one definition, pinned per release | One edit changes two pages with neither page body touched; rollback restores the old component on both with 0 files written; a component containing itself is refused before a row is written |
| 12 | Hosting does not read the filesystem | The live release's prerendered directory is **deleted mid-run**; the site keeps serving byte-identical HTML via slug and custom domain |

Plus `make test` (Vitest — unit + integration, including the byte-identical
rollback proof and the static-page-live-cart proof) and `make e2e` (Playwright —
edit → autosave → publish → view live → rollback → view reverted).

---

## Layout

```
prisma/schema.prisma      the tier split; comments explain each constraint
prisma/migrations/        + raw SQL: partial unique index, append-only triggers
src/lib/registry/         THE REGISTRY — name → component + prop schema
src/lib/registry/shared.tsx   the "@component" reference, as a real entry
src/lib/shared-components.ts  expansion, overrides, cycle detection — pure
src/lib/publish.ts        the snapshot transaction (job one)
src/lib/build.ts          freeze Tier-2, prerender for export, flip the pointer (job two)
src/lib/runtime/release.ts    THE READ PATH — one fresh pointer, one forever cache
src/lib/runtime/snapshot.ts   freezing live data into an immutable release
src/lib/runtime/render-page.tsx  release → React, shared by both site routes
src/lib/runtime/warm.ts   render each path once after a publish
src/lib/render/index.tsx  description → React elements (no react-dom/server)
src/lib/render/html.tsx   React → one HTML file. THE EXPORT ONLY.
src/lib/paths.ts          artifact locations, React-free on purpose
src/lib/refs.ts           reference extraction from prop schemas
src/lib/drafts.ts         one optimistic lock, used by pages and components
src/lib/dependencies.ts   the reverse index: "what breaks if I delete this?"
src/lib/editor/bootstrap.ts   what both editor routes load
src/worker/index.ts       the polling worker process
src/app/(app)/            the PRODUCT: dashboard, editor, walkthrough, landing
src/app/(site)/           PUBLISHED SITES: a second root layout that imports nothing
src/components/site/      chrome, cart island, the components a visitor gets
scripts/verify.ts         the twelve-check gate
```

`DECISIONS.md` records the reasoning chain and every implementation choice the
brief left open, including the ones that cost something.

---

## What's faked for the demo

Everything below is deliberately out of scope. Each is faked *cleanly* — the
shape is right, the substance is absent — and nothing else depends on pretending
otherwise.

- **Authentication.** One seeded user, a session cookie that is read but never
  verified, no login UI, and a `password_hash` of the literal string
  `seeded-no-login-ui`. Any request is treated as that user.
- **DNS and SSL.** Custom-domain *routing* is real (Host header matched against
  `sites.custom_domain`, with `?host=` to force it locally). Nobody registers a
  domain or issues a certificate.
- **Media storage.** No S3, no uploads, no image processing. Images are inline
  SVG data URIs generated by the seed — which is also why an exported zip works
  from `file://` with no network.
- **Payments.** Checkout writes an order with status `paid` immediately. There
  is no processor, no capture, no refund.
- **Container image builds.** The container export generates a real, correct
  `Dockerfile` and `docker-compose.yml` and bundles the artifact. It does not
  run `docker build` for you.
- **Blog module.** Schema exists (`posts`, `post_revisions`, `tags`,
  `post_tags`); there is no UI. Commerce was built fully instead, because it is
  what proves D8 and D5.
- **Multi-user editing.** `lock_version` gives last-write-wins with an honest
  409 and an "edited in another tab" message. There is no CRDT and no presence.
- **Scale.** One worker polling at 250ms, one app process, no CDN, no object
  storage. The release cache is an in-process `Map` capped at 64 entries; at real
  scale it is Redis or a CDN, and the property that makes it safe — a
  content-addressed key — is the same either way. "Which pages use this
  component?" scans draft bodies in application code rather than reading a
  maintained page→component edge table: honest and readable at demo scale, and
  the one place that would need an index first.

## What is *not* faked

The parts that would be tempting to fake, and aren't:

- The worker is a real separate OS process claiming jobs with `FOR UPDATE SKIP
  LOCKED`. Kill it mid-build and watch the site keep serving.
- Append-only is a database trigger. Application code cannot rewrite history
  even if it tries.
- Rollback really is one `UPDATE` of one column, and a test diffs the entire
  `sites` row plus every file under `artifacts/` to prove nothing else moved.
- Hosting genuinely does not touch the filesystem. `make verify` deletes the live
  release's prerendered directory mid-run and the site keeps serving.
- The runtime cannot see draft state. `make verify` rewrites a draft and asserts
  the live page is byte-identical afterwards, and checks structurally that no
  runtime module references a draft table or `react-dom/server`.
- A published page ships ~1.7 kB of its own JavaScript — the cart island. Every
  other component is a Server Component and sends none.
- The cart on a static page really does write to `orders`, and the HTML file's
  checksum really is unchanged afterwards.
- A shared component is genuinely one row. Two pages using it store a reference
  and none of its content — grep a page revision for the header's text and you
  will not find it. A release pins the component's *revision*, which is why
  rolling back gives you the old header rather than today's.

---

## Licence

MIT — see [LICENSE](LICENSE). Use it, fork it, learn from it.
