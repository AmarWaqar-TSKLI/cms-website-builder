# bookworm-slim (not alpine) — Prisma's query engine wants glibc + openssl.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

# NEXT_PUBLIC_* is inlined into the build, and this one is also baked into every
# exported artifact (so a downloaded zip's cart knows where to call — D8). In
# production pass it at build time: `--build-arg NEXT_PUBLIC_RUNTIME_API=https://…`.
# Unset, it is empty, which is exactly the previous behaviour for local dev.
ARG NEXT_PUBLIC_RUNTIME_API=""
ENV NEXT_PUBLIC_RUNTIME_API=$NEXT_PUBLIC_RUNTIME_API

# A PRODUCTION BUILD, baked into the image.
#
# This matters more than it looks. Hosting used to be a file read, so it made no
# difference whether the container ran `next dev` or `next start`. Now that a
# published page is RENDERED by the app, dev mode is actively wrong for it: the
# dev server appends a fresh `?v=<timestamp>` to every chunk URL on every
# request, so two renders of the same immutable release come back with different
# bytes. The determinism check in `make verify` catches exactly that.
#
# No database is needed at build time — every route that touches Postgres is
# dynamic, so nothing is prerendered against it.
RUN npm run build

EXPOSE 3000

# One image, two roles, chosen by an env var so a managed host (Railway) can run
# the same build as either the web app or the build worker — no per-service start
# command needed. RUN_WORKER=1 → the poller; otherwise migrate then serve.
# (docker-compose overrides `command:` for each service, so local is unaffected.)
CMD ["sh", "-c", "if [ \"$RUN_WORKER\" = \"1\" ]; then exec npm run worker:once; else npx prisma migrate deploy && exec npm start; fi"]
