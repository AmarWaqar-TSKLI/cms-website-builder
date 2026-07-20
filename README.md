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
  page_drafts  ──── 1 row per page, OVERWRITTEN
     │
     │  PUBLISH  ── one transaction, <200ms, returns now ──┐
     ▼                                                     │
  page_revisions (APPEND) → releases → release_items       │
                                                           ▼
                                                    build_jobs (queue)
                                                           │
                                            ┌──────────────┘
                                            ▼
                                    WORKER (separate process)
                                    registry → renderToStaticMarkup
                                            │
                                            ▼
                          artifacts/{site}/{release}/index.html   ← immutable
                                            │
                       ┌────────────────────┼────────────────────┐
                       ▼                    ▼                    ▼
                  hosted /s/slug        static .zip        container export
                       │
              sites.live_release_id  ←── rollback = change this one value
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
   version. Nothing was rebuilt; no file was written.
5. Open the live site, add something to the cart, check out. An order appears in
   `orders` and the HTML file's checksum does not move.

---

## Verification

`make verify` runs a scripted walkthrough against the live stack and prints a
PASS/FAIL line for each of the ten non-negotiables, exiting non-zero on any
failure.

| # | Non-negotiable | How it's proved |
|---|---|---|
| 1 | Never store HTML in the DB | Every stored body scanned for markup; bodies asserted to be `{type, props}` trees |
| 2 | `page_revisions` append-only | `UPDATE` and `DELETE` both rejected by a **database trigger** |
| 3 | `page_drafts` overwrite-only, one row per page | 10 autosaves → still 1 row; a second row rejected by the PRIMARY KEY |
| 4 | A revision holds the whole tree | Ordered arrangement round-trips; no per-component revision table exists |
| 5 | Publish returns before the build finishes | Snapshot under 200ms with the job still `queued` |
| 6 | Rollback is a single-column update | Whole `sites` row diffed — exactly one column changed; 0 jobs queued, 0 files touched |
| 7 | Serve the frozen artifact | Served bytes == file bytes; mtime unchanged; `serve.ts` cannot import a renderer |
| 8 | Products/orders never versioned | No `*_revisions` table for Tier 2; an order survives a rollback |
| 9 | Artifacts immutable | Old release's files unchanged across a publish + 3 rollbacks; rebuilding a ready release returns 409 |
| 10 | Hosting default, export additive | Hosted URL, custom domain and both exports all resolve to the same release id |

Plus `make test` (Vitest — unit + integration, including the byte-identical
rollback proof and the static-page-live-cart proof) and `make e2e` (Playwright —
edit → autosave → publish → view live → rollback → view reverted).

---

## Layout

```
prisma/schema.prisma      the tier split; comments explain each constraint
prisma/migrations/        + raw SQL: partial unique index, append-only triggers
src/lib/registry/         THE REGISTRY — name → component + prop schema
src/lib/publish.ts        the snapshot transaction (job one)
src/lib/build.ts          description → HTML on disk (job two)
src/lib/serve.ts          pointer lookup + file read. Cannot render.
src/lib/paths.ts          artifact locations, React-free on purpose
src/lib/refs.ts           reference extraction from prop schemas
src/lib/dependencies.ts   the reverse index: "what breaks if I delete this?"
src/worker/index.ts       the polling worker process
src/app/s/[slug]/         the hosted destination
src/app/site-by-host/     the custom-domain destination
scripts/verify.ts         the ten-check gate
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
- **Scale.** One worker polling at 250ms, artifacts on a local disk, no CDN, no
  object storage, no cache headers beyond `no-store`.

## What is *not* faked

The parts that would be tempting to fake, and aren't:

- The worker is a real separate OS process claiming jobs with `FOR UPDATE SKIP
  LOCKED`. Kill it mid-build and watch the site keep serving.
- Append-only is a database trigger. Application code cannot rewrite history
  even if it tries.
- Rollback really is one `UPDATE` of one column, and a test diffs the entire
  `sites` row plus every file under `artifacts/` to prove nothing else moved.
- The served page is read off disk. The serving module has no import path to a
  renderer, and `make verify` checks that it stays that way.
- The cart on a static page really does write to `orders`, and the HTML file's
  checksum really is unchanged afterwards.

---

## Licence

MIT — see [LICENSE](LICENSE). Use it, fork it, learn from it.
