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
CMD ["npm", "start"]
