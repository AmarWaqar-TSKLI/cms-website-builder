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

**The one gotcha worth reading twice — `NEXT_PUBLIC_RUNTIME_API`.** Hosted pages
read it server‑side per request, so a runtime value is fine there. But it is also
**baked into every exported artifact at build time** — that is how a downloaded
zip's cart still knows where to call (D8). So if you offer exports, build the
image with this set to your real public URL, or exported sites will try to reach
`localhost`.

---

## Single box with Docker + Caddy (the quickest real deploy)

**[you]** provision the host and a Postgres database, then put three files on the
host: your `.env` (with the production values above), and these two.

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

## Custom domains for the sites people build

The mechanism is already real: an incoming `Host` header is matched against
`sites.custom_domain`, and middleware rewrites to the per-host route (I9). What's
out of scope in the demo — and becomes your operational job in production — is the
DNS and TLS for each customer domain:

1. The customer points their domain at your server (a `CNAME` to `your-domain.com`
   or an `A` record to your IP). **[customer]**
2. Your proxy obtains a certificate for it. With the wildcard/on‑demand Caddy
   config above this is automatic; at scale you'd use Caddy's
   [on‑demand TLS](https://caddyserver.com/docs/automatic-https#on-demand-tls) with
   an `ask` endpoint so you only issue certs for domains that are actually
   configured. **[you]**
3. Set `sites.custom_domain` for that site (already editable in the model).

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
