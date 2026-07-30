# Deploying this for real

This runs on `localhost` today. Nothing about the architecture assumes that —
the app is a stateless Next.js server, the worker is a plain OS process, and the
only shared state is Postgres. This is what it takes to put it on the public
internet, and which parts only you can do.

> **What I (the assistant) can't do for you:** provision a server or database,
> register a domain, point DNS, obtain TLS certificates, or hold your secrets.
> Those need your accounts and your credentials. Everything below is the plan and
> the config; the steps marked **[you]** are yours to run.

---

## What you need

- **A Linux host** (a $5–10/mo VPS is plenty to start) with Docker installed, or
  any platform that runs containers (Fly.io, Render, Railway, a Kubernetes
  cluster — the shape is the same).
- **PostgreSQL 16.** Managed (RDS, Neon, Supabase, DigitalOcean) is easiest;
  self-hosted in a container works too.
- **A domain** you control, and the ability to edit its DNS.
- **TLS**, terminated by a reverse proxy (the example below uses Caddy, which gets
  certificates from Let's Encrypt automatically).

---

## The pieces, and how they scale

| Piece | What it is | Scaling |
|---|---|---|
| **app** | the Next.js server — dashboard, editor, and the hosted sites | **stateless**; run as many as you like behind a load balancer. The release cache is content-addressed, so two instances can never disagree. |
| **worker** | polls `build_jobs`, freezes Tier‑2 data, flips the live pointer | run one or several — jobs are claimed with `FOR UPDATE SKIP LOCKED`, so none is handed out twice. |
| **postgres** | the only shared state | one primary; back it up. |
| **artifacts dir** | prerendered files, used **only by the export** | not needed to serve traffic. If you want exports to work, give the worker a writable volume; the app doesn't read it. |

The important property: **serving reads Postgres, never the filesystem.** You do
not need a shared disk between app instances. `make verify` proves this by
deleting the live release's files mid‑run and watching the site keep serving.

---

## Environment

Set these on both the app and the worker (see `.env.example` for the full list):

```bash
DATABASE_URL="postgresql://USER:PASSWORD@DB_HOST:5432/cms?schema=public"
ARTIFACTS_DIR="/app/artifacts"          # worker needs it writable if you want exports
NEXT_PUBLIC_RUNTIME_API="https://your-domain.com"   # the PUBLIC origin
APP_INTERNAL_URL="http://app:3000"      # how the worker reaches the app to warm a release
```

**Optional production hardening** — every one is a no-op unless set, and all are
listed in `.env.example`:

```bash
# Login rate limiting shared across app instances (Upstash Redis REST — no SDK).
# Unset, the limiter still runs, just per-process.
RATE_LIMIT_REST_URL="https://…"; RATE_LIMIT_REST_TOKEN="…"

# Error monitoring — a generic webhook (Sentry ingest, a Slack webhook, your own).
MONITOR_WEBHOOK="https://…"

# Object storage for a large media library — any S3-compatible bucket. Exports
# stay self-contained because the build inlines the bytes back (see I13).
STORAGE_S3_ENDPOINT="https://…"; STORAGE_S3_BUCKET="…"
STORAGE_S3_ACCESS_KEY_ID="…"; STORAGE_S3_SECRET_ACCESS_KEY="…"
```

**The one gotcha worth reading twice — `NEXT_PUBLIC_RUNTIME_API`.** Hosted pages
read it server‑side per request, so a runtime value is fine there. But it is also
**baked into every exported artifact at build time** — that is how a downloaded
zip's cart still knows where to call (D8). So if you offer exports, build the
image with this set to your real public URL, or exported sites will try to reach
`localhost`.

---

## Single box with Docker + Caddy (the quickest real deploy)

**[you]** provision the host and a Postgres database. Two of the three files you
need already live in the repo — **`compose.prod.yml`** and **`Caddyfile`** (edit
`your-domain.com` in the latter); the third is your **`.env`** with the production
values above. The blocks below are what those committed files contain, kept here
for reference — the files themselves are the source of truth, and the real
`compose.prod.yml` also adds an app health-check and Caddy state volumes.

`compose.prod.yml` — app + worker + a TLS-terminating proxy, talking to an
**external** managed database:

```yaml
name: cms

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        # NEXT_PUBLIC_* is inlined at build; pass it here so exports are correct.
        NEXT_PUBLIC_RUNTIME_API: ${NEXT_PUBLIC_RUNTIME_API}
    command: sh -c "npx prisma migrate deploy && npm start"
    env_file: .env
    restart: unless-stopped
    expose: ["3000"]

  worker:
    build: { context: ., dockerfile: Dockerfile }
    command: npm run worker:once
    env_file: .env
    restart: unless-stopped
    volumes:
      - artifacts:/app/artifacts   # only if you want exports

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on: [app]

volumes:
  artifacts:
  caddy_data:
```

`Caddyfile` — automatic HTTPS, reverse-proxied to the app:

```
your-domain.com {
  reverse_proxy app:3000
}

# Custom site domains: send them to the same app. It matches the Host header
# against sites.custom_domain and serves the right site (see release.ts / I9).
# Caddy will fetch a certificate for each on first request.
*.your-domain.com, acme.test {
  reverse_proxy app:3000
}
```

Then, **[you]**:

```bash
docker compose -f compose.prod.yml up -d --build
docker compose -f compose.prod.yml exec app npx tsx prisma/seed.ts   # optional: demo data
```

**[you]** point your domain's DNS `A`/`AAAA` records at the host's IP. Caddy
obtains certificates on the first HTTPS request. That's a live deployment.

---

## Railway + Supabase (managed — no server to run yourself)

The quickest real deploy that still runs the worker. Two Railway services from
this one repo (both build the `Dockerfile`), a Supabase Postgres, done.

**Supabase (the database).** Create a project. From *Project Settings → Database*
copy **two** connection strings:

- **Pooled** (Transaction pooler, port `6543`) → `DATABASE_URL`, with
  `?pgbouncer=true&connection_limit=1` appended. This is what the app uses at runtime.
- **Direct** (port `5432`) → `DIRECT_URL`. Prisma uses it to run migrations, which
  a pooler can't do. (`schema.prisma` gets a `directUrl = env("DIRECT_URL")` line —
  wired at deploy time so local dev, which has no pooler, is unaffected.)

**Railway service 1 — `app`.** Deploy from the repo (it auto-detects the
Dockerfile). Then:

- **Start command:** `sh -c "npx prisma migrate deploy && npm start"` (migrate, then serve).
- **Build arg** `NEXT_PUBLIC_RUNTIME_API` = the app's public URL (its
  `*.up.railway.app`, or the custom domain) — it's inlined at build, so set it and redeploy.
- **Variables:** `DATABASE_URL`, `DIRECT_URL`, `ARTIFACTS_DIR=/app/artifacts`,
  `APP_INTERNAL_URL` = the app's own internal URL, and the `CUSTOM_DOMAIN_CNAME`
  (point customers at the app's Railway domain) once known.

**Railway service 2 — `worker`.** Same repo/image, one override:

- **Start command:** `npm run worker:once` (the persistent poll loop).
- **Variables:** the same `DATABASE_URL`/`DIRECT_URL`/`ARTIFACTS_DIR`/`APP_INTERNAL_URL`.

**First run:** once `app` is up, run the seed once to create an admin +
demo data — Railway's shell: `npx tsx prisma/seed.ts` — or skip it and use `/signup`.

**Note on the app listening port:** Railway injects `$PORT`; the app's start is
plain `next start`, which honours `PORT` (and defaults to 3000), so it works
locally on 3000 and on Railway on whatever port it's given. Health check:
`GET /api/health`.

Custom domains work exactly as below, except the customer CNAMEs to the app's
Railway domain and Railway/our on-demand-TLS issues the certificate.

## Custom domains for the sites people build

This is a real, self-serve feature now, not just a mechanism. A site owner opens
their dashboard, types a domain into **"Use your own domain"**, and gets the exact
DNS record to add plus a live "connected / waiting" check. Under it: the request
path matches the incoming `Host` header against `sites.custom_domain` and serves
the site (release.ts / I9), and apex/`www` are treated as the same site.

Two env vars decide what the panel tells customers to point at (set one):

```bash
CUSTOM_DOMAIN_CNAME="sites.your-domain.com"   # best — survives an IP change
# or
CUSTOM_DOMAIN_IP="203.0.113.10"               # the server's public IP
```

What's yours to operate is the DNS and TLS for each customer domain:

1. The customer points their domain at your server — a `CNAME` to your
   `CUSTOM_DOMAIN_CNAME` host, or an `A` record to `CUSTOM_DOMAIN_IP`. They do this
   at their own registrar. **[customer]**
2. Your proxy obtains a certificate for it **automatically** — the committed
   `Caddyfile` uses [on‑demand TLS](https://caddyserver.com/docs/automatic-https#on-demand-tls)
   gated by `ask http://app:3000/api/domains/check`, so a cert is only ever fetched
   for a domain a site has actually connected (never for a random hostname aimed at
   your IP). **[you — already wired]**
3. The owner connects the domain in the dashboard, which writes
   `sites.custom_domain`. No manual DB editing.

---

## Operational notes

- **Migrations** run on app start (`prisma migrate deploy`). Zero‑downtime deploys
  want migrations that are safe against the old code for one release — the schema
  here is additive, which helps.
- **Backups:** Postgres is the whole system. Back it up. Releases are immutable,
  so point‑in‑time recovery restores a coherent history.
- **Object storage:** uploaded images are stored inline as data URIs (decision
  I13), which is what makes exports self‑contained. That's fine for typical sites;
  a very large media library would want real object storage, at which point
  `media.storage_key` becomes a URL and the resolve points (bootstrap, snapshot,
  context) read from there instead. Nothing else changes.
- **Login rate limiting** is in‑process today (fine for one instance). Behind
  several app instances, move it to Redis or the edge.
- **Health check:** `GET /api/health` returns 200 when the app is up — wire it to
  your platform's health probe.
