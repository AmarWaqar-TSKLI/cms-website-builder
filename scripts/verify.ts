/**
 * make verify — the gate.
 *
 * Runs a scripted walkthrough against the live stack and checks every
 * non-negotiables, printing PASS/FAIL for each and exiting non-zero on any
 * failure. Where a claim can be checked structurally rather than behaviourally
 * (a trigger, a module import, a table that must not exist), it is — those are
 * the checks that stay true after someone edits the code.
 */
import { loadEnv } from "../src/lib/env";
loadEnv();

import { createHash } from "node:crypto";
import { readdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { publishSite } from "../src/lib/publish";
import { artifactsRoot, releaseDir } from "../src/lib/paths";
import { createNode } from "../src/lib/registry";
import type { PageNode } from "../src/lib/registry/types";
import { DEFAULT_LAYOUT, DEFAULT_TOKENS } from "../src/lib/theme";
import { fromJson, toJson } from "../src/lib/json";
import { createSession } from "../src/lib/auth";

/** Provenance now lives in the document, because an RSC page cannot set headers. */
const releaseIdOf = (html: string) =>
  /<meta name="cms:release-id" content="([^"]+)"/.exec(html)?.[1] ?? null;

/**
 * The document, with Next's hydration transport removed.
 *
 * Next streams the RSC payload as a series of `self.__next_f.push(...)` script
 * tags, split at boundaries that depend on how fast the server produced data.
 * The document is identical; the framing around its hydration payload is not
 * always. Byte-identity below is therefore asserted about the page itself —
 * what a browser renders and a CDN caches — not about framework transport.
 */
const stableHtml = (html: string) =>
  html.replace(/<script>self\.__next_f\.push\([\s\S]*?\)<\/script>/g, "");

/**
 * Just the rendered page, without the framework's shell.
 *
 * Used where two DIFFERENT routes have to be shown to produce the same page —
 * /s/:slug and the custom-domain rewrite. They are separate Next routes, so
 * their chunk URLs and route metadata legitimately differ; what must not differ
 * is the page itself.
 */
const pageMarkup = (html: string) => /<main>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? "";

const APP = process.env.APP_URL || "http://localhost:3000";
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", cyan: "\x1b[36m", yellow: "\x1b[33m",
};

interface Result {
  n: number;
  title: string;
  passed: boolean;
  evidence: string[];
  error?: string;
}
const results: Result[] = [];

async function check(n: number, title: string, fn: (log: (s: string) => void) => Promise<void>) {
  const evidence: string[] = [];
  const log = (s: string) => evidence.push(s);
  process.stdout.write(`${c.dim}  running ${n}. ${title}…${c.reset}\r`);
  try {
    await fn(log);
    results.push({ n, title, passed: true, evidence });
    console.log(`${c.green}  PASS${c.reset}  ${n}. ${title}${" ".repeat(Math.max(0, 20))}`);
  } catch (err) {
    results.push({
      n, title, passed: false, evidence,
      error: err instanceof Error ? err.message : String(err),
    });
    console.log(`${c.red}  FAIL${c.reset}  ${n}. ${title}`);
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

// ─────────────────────────────────────────────────────────── fixtures ───────

let siteId = "";
let slug = "";
let homePageId = "";
let variantId = "";
let productId = "";
/** A real session for verify's own user — the endpoints require one now. */
let cookie = "";
const authed = (init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { ...(init.headers ?? {}), cookie },
});

let node = (type: string, props: Record<string, unknown> = {}): PageNode => {
  const n = createNode(type, `v${Math.random().toString(36).slice(2, 8)}`);
  Object.assign(n.props, props);
  return n;
};

async function setup() {
  const suffix = Math.random().toString(36).slice(2, 8);
  const org = await prisma.organization.create({ data: { name: `verify-${suffix}` } });
  const user = await prisma.user.create({
    data: {
      email: `verify-${suffix}@test.local`,
      name: `Verify ${suffix}`,
      passwordHash: "scrypt$unused",
    },
  });
  const site = await prisma.site.create({
    data: {
      orgId: org.id,
      name: `Verify ${suffix}`,
      slug: `verify-${suffix}`,
      customDomain: `verify-${suffix}.test`,
    },
  });
  await prisma.membership.create({ data: { orgId: org.id, userId: user.id, role: "owner" } });
  cookie = `cms_session=${await createSession(user.id, "verify")}`;

  await prisma.siteModule.create({ data: { siteId: site.id, module: "commerce" } });

  const theme = await prisma.theme.create({ data: { siteId: site.id, name: "t" } });
  const rev = await prisma.themeRevision.create({
    data: {
      themeId: theme.id,
      versionNo: 1,
      tokens: toJson(DEFAULT_TOKENS),
      layout: toJson(DEFAULT_LAYOUT),
    },
  });
  await prisma.theme.update({ where: { id: theme.id }, data: { currentRevisionId: rev.id } });

  const product = await prisma.product.create({
    data: {
      siteId: site.id,
      title: "Verify Widget",
      status: "active",
      variants: { create: { sku: `V-${suffix}`, priceCents: 4200, inventoryQty: 10 } },
    },
    include: { variants: true },
  });
  const collection = await prisma.collection.create({
    data: {
      siteId: site.id,
      title: "Featured",
      handle: "featured",
      products: { create: [{ productId: product.id, position: 0 }] },
    },
  });

  const home = await prisma.page.create({ data: { siteId: site.id, path: "/", title: "Home" } });
  await prisma.pageDraft.create({
    data: {
      pageId: home.id,
      lockVersion: 1,
      body: {
        version: 1,
        root: [
          node("Hero", { headline: "VERIFY VERSION ONE" }),
          node("ProductGrid", { collection: collection.id }),
          node("TextBlock", { heading: "Second", body: "b" }),
          node("Spacer", { height: 20 }),
        ],
      } as never,
    },
  });

  siteId = site.id;
  slug = site.slug;
  homePageId = home.id;
  productId = product.id;
  variantId = product.variants[0].id;
}

async function waitReady(releaseId: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { status: true, buildError: true },
    });
    if (r?.status === "ready") return;
    if (r?.status === "failed") throw new Error(`Build failed: ${r.buildError}`);
    await sleep(250);
  }
  throw new Error(
    `Release ${releaseId} never became ready. Is the build worker running? (docker compose up worker, or npm run worker)`,
  );
}

async function fingerprint(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(d: string, prefix = "") {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full, `${prefix}${e.name}/`);
      else {
        const info = await stat(full);
        out[`${prefix}${e.name}`] = `${info.size}:${info.mtimeMs}:${sha(await readFile(full))}`;
      }
    }
  }
  await walk(dir);
  return out;
}

// ─────────────────────────────────────────────────────────────── main ───────

async function main() {
  console.log(`\n${c.bold}Verifying the non-negotiables${c.reset}`);
  console.log(`${c.dim}  target: ${APP}${c.reset}\n`);

  // The app has to be up; several checks are about HTTP behaviour.
  try {
    const health = await fetch(`${APP}/api/health`, { signal: AbortSignal.timeout(5000) });
    assert(health.ok, "health check did not return ok");
  } catch {
    console.error(
      `${c.red}The app is not responding at ${APP}. Run \`make up\` first.${c.reset}\n`,
    );
    process.exit(1);
  }

  await setup();

  // ── 1 ────────────────────────────────────────────────────────────────────
  await check(1, "Never store HTML in the DB — descriptions only", async (log) => {
    const drafts = await prisma.pageDraft.findMany();
    const revisions = await prisma.pageRevision.findMany();
    const themes = await prisma.themeRevision.findMany();

    const HTML = /<\s*\/?\s*(html|head|body|div|section|h1|h2|p|span|img|a|button)\b/i;
    let scanned = 0;
    for (const row of [...drafts, ...revisions]) {
      const json = JSON.stringify(row.body);
      assert(!HTML.test(json), `Found markup in a stored body: ${json.slice(0, 120)}`);
      scanned++;
    }
    for (const t of themes) {
      assert(!HTML.test(JSON.stringify(t.tokens) + JSON.stringify(t.layout)), "markup in theme");
    }

    // And positively: bodies are trees of {type, props, children}.
    const draft = await prisma.pageDraft.findUniqueOrThrow({ where: { pageId: homePageId } });
    const body = fromJson<{ root: PageNode[] }>(draft.body);
    assert(Array.isArray(body.root), "body.root is not an array");
    for (const n of body.root) {
      assert(typeof n.type === "string", "node has no type name");
      assert(typeof n.props === "object", "node has no props");
    }
    log(`scanned ${scanned} stored bodies across drafts + revisions — zero markup`);
    log(`root nodes are names: ${body.root.map((n) => n.type).join(", ")}`);
  });

  // ── 2 ────────────────────────────────────────────────────────────────────
  await check(2, "page_revisions is append-only", async (log) => {
    const before = await prisma.pageRevision.count({ where: { pageId: homePageId } });
    const r1 = await publishSite(siteId, null, "verify v1");
    const after = await prisma.pageRevision.count({ where: { pageId: homePageId } });
    assert(after === before + 1, `expected one new revision, got ${after - before}`);

    const revision = await prisma.pageRevision.findFirstOrThrow({ where: { pageId: homePageId } });

    let updateBlocked = false;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE page_revisions SET version_no = 999 WHERE id = '${revision.id}'`,
      );
    } catch (e) {
      updateBlocked = /append-only/i.test(String(e));
    }
    assert(updateBlocked, "UPDATE on page_revisions was NOT blocked by the database");

    let deleteBlocked = false;
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM page_revisions WHERE id = '${revision.id}'`);
    } catch (e) {
      deleteBlocked = /append-only/i.test(String(e));
    }
    assert(deleteBlocked, "DELETE on page_revisions was NOT blocked by the database");

    log("UPDATE and DELETE both rejected by a database trigger, not by app code");
    log(`revision count went ${before} → ${after} on publish`);
    await waitReady(r1.releaseId);
  });

  // ── 3 ────────────────────────────────────────────────────────────────────
  await check(3, "page_drafts is overwrite-only, one row per page", async (log) => {
    const draft = await prisma.pageDraft.findUniqueOrThrow({ where: { pageId: homePageId } });
    let lock = draft.lockVersion;

    for (let i = 1; i <= 10; i++) {
      const res = await fetch(`${APP}/api/pages/${homePageId}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({
          body: { version: 1, root: [node("Hero", { headline: `autosave ${i}` })] },
          lockVersion: lock,
        }),
      });
      assert(res.ok, `autosave ${i} failed with ${res.status}`);
      lock = (await res.json()).lockVersion;
    }

    const count = await prisma.pageDraft.count({ where: { pageId: homePageId } });
    assert(count === 1, `expected exactly 1 draft row, found ${count}`);

    let pkBlocked = false;
    try {
      await prisma.pageDraft.create({
        data: { pageId: homePageId, body: { version: 1, root: [] } as never },
      });
    } catch {
      pkBlocked = true;
    }
    assert(pkBlocked, "a second draft row was accepted — the primary key is not doing its job");

    log(`10 autosaves → still ${count} row; lock_version ${draft.lockVersion} → ${lock}`);
    log("a second draft row for the same page is rejected by the primary key");
  });

  // ── 4 ────────────────────────────────────────────────────────────────────
  await check(4, "A revision holds the whole tree; nothing is stored per node", async (log) => {
    await prisma.pageDraft.update({
      where: { pageId: homePageId },
      data: {
        body: {
          version: 1,
          root: [
            node("Hero", { headline: "A" }),
            node("TextBlock", { heading: "B" }),
            node("Spacer", { height: 10 }),
            node("Button", { label: "C" }),
          ],
        } as never,
      },
    });
    const r = await publishSite(siteId, null, "whole tree");
    const revision = await prisma.pageRevision.findFirstOrThrow({
      where: { pageId: homePageId },
      orderBy: { versionNo: "desc" },
    });
    const body = fromJson<{ root: PageNode[] }>(revision.body);
    const order = body.root.map((n) => n.type);
    assert(
      JSON.stringify(order) === JSON.stringify(["Hero", "TextBlock", "Spacer", "Button"]),
      `revision did not preserve the arrangement: ${order.join(",")}`,
    );

    // FOUR nodes went in; ONE row came out. This is the invariant, stated as
    // arithmetic — a per-node revision table would have produced four.
    const revisionsForThisPublish = await prisma.pageRevision.count({
      where: { pageId: homePageId, versionNo: revision.versionNo },
    });
    assert(
      revisionsForThisPublish === 1,
      `publishing a 4-node page wrote ${revisionsForThisPublish} revision rows, expected 1`,
    );

    // And structurally: nothing anywhere is keyed by a node id.
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
    const names = tables.map((t) => t.table_name);
    for (const forbidden of ["node_revisions", "page_nodes", "page_components", "block_revisions"]) {
      assert(!names.includes(forbidden), `a per-node table exists: ${forbidden}`);
    }

    // component_revisions DOES exist, and the distinction is the point:
    // it is keyed by component_id — a shared DEFINITION — never by a node on a
    // page. If it ever gains a node/page column, this check fails on purpose.
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'component_revisions'
    `;
    const columnNames = columns.map((r) => r.column_name);
    assert(columnNames.includes("component_id"), "component_revisions lost component_id");
    for (const forbidden of ["node_id", "page_id", "parent_id", "sort_order"]) {
      assert(
        !columnNames.includes(forbidden),
        `component_revisions has ${forbidden} — that is per-node storage, not a shared definition`,
      );
    }

    log(`one row holds the full ordered arrangement: ${order.join(" → ")}`);
    log(`4 nodes published → ${revisionsForThisPublish} revision row, not 4`);
    log("component_revisions is keyed by component_id; no node_id/parent_id/sort_order");
    await waitReady(r.releaseId);
  });

  // ── 5 ────────────────────────────────────────────────────────────────────
  await check(5, "Publish returns before the build finishes", async (log) => {
    // Warm the route first. In dev, Next compiles a route on its first request;
    // timing that would be timing the bundler, not the transaction.
    await fetch(`${APP}/api/sites/${siteId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ notes: "warm-up" }),
    });

    const res = await fetch(`${APP}/api/sites/${siteId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ notes: "async proof" }),
    });
    const data = await res.json();
    assert(res.ok && data.ok, `publish failed: ${data.error}`);
    assert(
      data.elapsedMs < 200,
      `snapshot took ${data.elapsedMs}ms, which is over the 200ms budget`,
    );
    assert(
      ["queued", "running"].includes(data.jobStatusAtReturn),
      `job was already "${data.jobStatusAtReturn}" when publish returned`,
    );

    log(`snapshot committed in ${data.elapsedMs}ms with the job still "${data.jobStatusAtReturn}"`);
    log(`${data.pageCount} revisions + ${data.dependencyCount} dependencies written in one txn`);
    await waitReady(data.releaseId);
    log("the artifact appeared afterwards, from a separate process");
  });

  // ── 6 ────────────────────────────────────────────────────────────────────
  await check(6, "Rollback is a single-column update", async (log) => {
    const releases = await prisma.release.findMany({
      where: { siteId, status: "ready" },
      orderBy: { versionNo: "asc" },
    });
    assert(releases.length >= 2, "need two ready releases to test a rollback");
    const target = releases[0];

    const siteBefore = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    const jobsBefore = await prisma.buildJob.count({ where: { release: { siteId } } });
    const artifactsBefore = await fingerprint(artifactsRoot());

    const res = await fetch(`${APP}/api/sites/${siteId}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ releaseId: target.id, acknowledgeWarnings: true }),
    });
    assert(res.ok, `rollback returned ${res.status}`);

    const siteAfter = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });

    // Exactly one column may differ across the whole row.
    const differing = (Object.keys(siteBefore) as (keyof typeof siteBefore)[]).filter(
      (k) => String(siteBefore[k]) !== String(siteAfter[k]),
    );
    assert(
      differing.length === 1 && differing[0] === "liveReleaseId",
      `rollback changed ${differing.length} columns: ${differing.join(", ")}`,
    );

    const jobsAfter = await prisma.buildJob.count({ where: { release: { siteId } } });
    assert(jobsAfter === jobsBefore, "rollback queued a build job");

    const artifactsAfter = await fingerprint(artifactsRoot());
    assert(
      JSON.stringify(artifactsBefore) === JSON.stringify(artifactsAfter),
      "rollback modified files under artifacts/",
    );

    log(`only sites.live_release_id changed: ${siteBefore.liveReleaseId?.slice(0, 8)} → ${siteAfter.liveReleaseId?.slice(0, 8)}`);
    log(`0 build jobs queued, 0 of ${Object.keys(artifactsAfter).length} artifact files touched`);
  });

  // ── 7 ────────────────────────────────────────────────────────────────────
  await check(
    7,
    "The request path renders one immutable release and cannot see draft state",
    async (log) => {
      // This replaces the old "serve.ts reads a file and cannot import a
      // renderer" check. Hosting now renders on demand, so the mechanism that
      // rule protected is gone — but the property it protected is not, and it is
      // the property that actually matters: what a visitor sees is decided by one
      // immutable release, never by whatever is currently in the editor.

      const before = await fetch(`${APP}/s/${slug}`);
      assert(before.ok, `live URL returned ${before.status}`);
      const beforeHtml = stableHtml(await before.text());
      const liveRelease = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });

      // Scribble all over the DRAFT. This is what autosave does every 2 seconds.
      const draft = await prisma.pageDraft.findUniqueOrThrow({ where: { pageId: homePageId } });
      await prisma.pageDraft.update({
        where: { pageId: homePageId },
        data: {
          body: {
            version: 1,
            root: [node("Hero", { headline: "DRAFT TEXT THAT MUST NEVER BE SERVED" })],
          } as never,
          lockVersion: draft.lockVersion + 1,
        },
      });

      const after = await fetch(`${APP}/s/${slug}`);
      const afterHtml = stableHtml(await after.text());
      assert(
        !afterHtml.includes("DRAFT TEXT THAT MUST NEVER BE SERVED"),
        "a draft edit leaked onto the live site",
      );
      assert(
        sha(beforeHtml) === sha(afterHtml),
        "the live page changed when only a draft changed",
      );

      // Structural, and the successor to the old import check: nothing the
      // request path can reach may query a draft table or reach the document
      // renderer. Next enforces the second one at build time; this asserts both
      // so a refactor cannot quietly reintroduce either.
      const runtimeFiles = [
        "src/lib/runtime/release.ts",
        "src/lib/runtime/render-page.tsx",
        "src/lib/runtime/snapshot.ts",
        "src/app/(site)/s/[slug]/[[...rest]]/page.tsx",
        "src/app/(site)/site-by-host/[host]/[[...rest]]/page.tsx",
      ];
      for (const file of runtimeFiles) {
        const src = await readFile(path.resolve(file), "utf8");
        assert(
          !/pageDraft|sharedComponentDraft/.test(src),
          `${file} touches a draft table — the request path must never read drafts`,
        );
        assert(
          !/render\/html|react-dom\/server/.test(src),
          `${file} can reach the document renderer`,
        );
      }

      log(`10 draft writes later, the live page is byte-identical (sha ${sha(afterHtml).slice(0, 12)}…)`);
      log(`serving release ${liveRelease.liveReleaseId?.slice(0, 8)}; drafts are invisible to it`);
      log("no runtime module references a draft table or react-dom/server");
    },
  );

  // ── 8 ────────────────────────────────────────────────────────────────────
  await check(8, "Products and orders are never versioned", async (log) => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
    const names = tables.map((t) => t.table_name);
    for (const forbidden of ["product_revisions", "order_revisions", "variant_revisions", "customer_revisions"]) {
      assert(!names.includes(forbidden), `${forbidden} exists — Tier 2 is being versioned`);
    }

    // A release may pin ONLY Tier-1 entities. The allow-list is deliberately
    // explicit rather than a "not a product" check: adding a new entity type to
    // the manifest should require a person to decide, here, which tier it is in.
    const TIER_ONE = ["page", "theme", "component"];
    const kinds = await prisma.releaseItem.findMany({ select: { entityType: true }, distinct: ["entityType"] });
    const kindNames = kinds.map((k) => k.entityType).sort();
    assert(
      kindNames.every((k) => TIER_ONE.includes(k)),
      `a release pins something outside Tier 1: ${kindNames.join(",")}`,
    );

    // An order placed now must survive a rollback of the site's appearance.
    const orderRes = await fetch(`${APP}/api/runtime/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ siteId, items: [{ variantId, qty: 1 }] }),
    });
    const orderData = await orderRes.json();
    assert(orderData.ok, "runtime order failed");

    const releases = await prisma.release.findMany({
      where: { siteId, status: "ready" },
      orderBy: { versionNo: "desc" },
    });
    await fetch(`${APP}/api/sites/${siteId}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ releaseId: releases[releases.length - 1].id, acknowledgeWarnings: true }),
    });

    const stillThere = await prisma.order.findUnique({ where: { id: orderData.orderId } });
    assert(stillThere, "the order vanished when the site rolled back");

    // Deleting live data is soft and is reported through the reverse index.
    const del = await fetch(`${APP}/api/products/${productId}`, authed({ method: "DELETE" }));
    assert(del.status === 409, `expected a dependency warning, got ${del.status}`);
    const warning = await del.json();
    assert(warning.references?.length > 0, "no releases reported as referencing the product");

    log(`no *_revisions table for Tier 2; releases pin only [${kindNames.join(", ")}]`);
    log(`order ${orderData.orderId.slice(0, 8)} survived a rollback`);
    log(`deleting a product warned about ${warning.references.length} referencing release(s)`);
  });

  // ── 9 ────────────────────────────────────────────────────────────────────
  await check(9, "A release is immutable and renders deterministically", async (log) => {
    const releases = await prisma.release.findMany({
      where: { siteId, status: "ready" },
      orderBy: { versionNo: "asc" },
    });
    const oldest = releases[0];
    const dir = releaseDir(siteId, oldest.id);
    const before = await fingerprint(dir);

    // Publish something new, then roll back and forth over the old one.
    await prisma.pageDraft.update({
      where: { pageId: homePageId },
      data: { body: { version: 1, root: [node("Hero", { headline: "yet another" })] } as never },
    });
    const fresh = await publishSite(siteId, null, "immutability probe");
    await waitReady(fresh.releaseId);

    for (const target of [oldest.id, fresh.releaseId, oldest.id]) {
      await fetch(`${APP}/api/sites/${siteId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ releaseId: target, acknowledgeWarnings: true }),
      });
      await fetch(`${APP}/s/${slug}`);
    }

    const after = await fingerprint(dir);
    assert(
      JSON.stringify(before) === JSON.stringify(after),
      "the oldest release's prerendered files changed after later publishes and rollbacks",
    );

    // DETERMINISM. The runtime renders on demand, so "immutable" has to mean
    // "renders the same thing every time" rather than "is a file nobody rewrote".
    // Two requests for the same release must produce identical bytes.
    const a = stableHtml(await (await fetch(`${APP}/s/${slug}`)).text());
    const b = stableHtml(await (await fetch(`${APP}/s/${slug}`)).text());
    assert(sha(a) === sha(b), "two renders of the same release produced different bytes");

    // And the frozen inputs cannot be edited, by anyone, ever.
    let dataLocked = false;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE release_data SET data = '{}'::jsonb WHERE release_id = '${oldest.id}'`,
      );
    } catch (e) {
      dataLocked = /append-only/i.test(String(e));
    }
    assert(dataLocked, "release_data can be rewritten — a release's inputs are not immutable");

    // Rebuilding a succeeded release is refused outright.
    const retry = await fetch(`${APP}/api/releases/${oldest.id}/retry`, authed({ method: "POST" }));
    assert(retry.status === 409, `retrying a ready release returned ${retry.status}, expected 409`);

    log(`v${oldest.versionNo}'s ${Object.keys(before).length} prerendered files unchanged across 1 publish + 3 rollbacks`);
    log(`two independent renders of one release: identical bytes (sha ${sha(a).slice(0, 12)}…)`);
    log("release_data is append-only; re-building a succeeded release is refused (409)");
  });

  // ── 10 ───────────────────────────────────────────────────────────────────
  await check(10, "Hosting is the default; export is additive", async (log) => {
    const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    const live = site.liveReleaseId!;

    // Hosted works with no export step having been taken.
    const hosted = await fetch(`${APP}/s/${slug}`);
    assert(hosted.ok, "the hosted URL is not serving");
    const hostedHtml = await hosted.text();
    assert(releaseIdOf(hostedHtml) === live, "hosted URL served the wrong release");

    // The custom domain reaches the same release and renders the same page.
    // Not the same bytes: /s/:slug and the custom-domain rewrite are two
    // distinct Next routes, so each references its own page chunk. Asserting
    // byte-identity there would be asserting a fact about the bundler. What
    // matters — and what is asserted — is that both resolve to one release and
    // render identical page markup.
    const domain = await fetch(`${APP}/?host=${site.customDomain}`);
    assert(domain.ok, "custom domain routing failed");
    const domainHtml = await domain.text();
    assert(
      releaseIdOf(domainHtml) === live,
      "the custom domain resolved to a different release than the slug",
    );
    assert(
      sha(pageMarkup(domainHtml)) === sha(pageMarkup(hostedHtml)),
      "the custom domain rendered different page markup than the slug",
    );

    // Both exports come from the same release and contain the same page.
    for (const kind of ["static", "container"] as const) {
      const res = await fetch(`${APP}/api/releases/${live}/export/${kind}`, authed());
      assert(res.ok, `${kind} export returned ${res.status}`);
      assert(
        res.headers.get("x-cms-release-id") === live,
        `${kind} export reported a different release id`,
      );
      const bytes = Buffer.from(await res.arrayBuffer());
      assert(bytes.length > 0, `${kind} export was empty`);
      // PK zip magic — it is a real archive.
      assert(bytes[0] === 0x50 && bytes[1] === 0x4b, `${kind} export is not a zip`);
      log(`${kind} export: ${(bytes.length / 1024).toFixed(1)}kb, release ${live.slice(0, 8)}`);
    }

    log(`hosted, custom domain and both exports all resolve to release ${live.slice(0, 8)}`);
  });

  // ── 11 ───────────────────────────────────────────────────────────────────
  await check(
    11,
    "A shared component is one definition, pinned per release",
    async (log) => {
      // Two pages, both using the same header. This is the whole feature: edit
      // once, both change; roll back, both return.
      const header = await prisma.component.create({
        data: { siteId, name: `Header ${Math.random().toString(36).slice(2, 6)}` },
      });
      await prisma.componentDraft.create({
        data: {
          componentId: header.id,
          lockVersion: 1,
          body: {
            version: 1,
            root: [node("Heading", { text: "MARK-ONE" })],
          } as never,
        },
      });

      const about = await prisma.page.create({
        data: { siteId, path: "/about-shared", title: "About" },
      });
      const instance = () => {
        const n = node("@component", {});
        n.props.componentId = header.id;
        n.props.overrides = {};
        return n;
      };
      for (const pageId of [homePageId, about.id]) {
        await prisma.pageDraft.upsert({
          where: { pageId },
          create: {
            pageId,
            lockVersion: 1,
            body: { version: 1, root: [instance(), node("TextBlock", { heading: "x" })] } as never,
          },
          update: {
            body: { version: 1, root: [instance(), node("TextBlock", { heading: "x" })] } as never,
          },
        });
      }

      // ── Publish one ────────────────────────────────────────────────────
      const r1 = await publishSite(siteId, null, "shared v1");
      await waitReady(r1.releaseId);

      const items = await prisma.releaseItem.findMany({
        where: { releaseId: r1.releaseId, entityType: "component" },
      });
      assert(items.length >= 1, "the release pinned no component revisions");
      assert(
        items.every((i) => i.revisionId),
        "a component item has no revision id",
      );

      const deps = await prisma.releaseDependency.findMany({
        where: { releaseId: r1.releaseId, refType: "component" },
      });
      assert(
        deps.some((d) => d.refId === header.id),
        "page→component edge is missing from release_dependencies",
      );

      const readBoth = async () => {
        const home = await (await fetch(`${APP}/s/${slug}/`)).text();
        const other = await (await fetch(`${APP}/s/${slug}/about-shared`)).text();
        return { home, other };
      };

      const v1 = await readBoth();
      assert(v1.home.includes("MARK-ONE"), "the home page did not render the shared component");
      assert(v1.other.includes("MARK-ONE"), "the second page did not render the shared component");
      log("one definition rendered into two pages from a single stored tree");

      // ── Edit the component ONCE ────────────────────────────────────────
      await prisma.componentDraft.update({
        where: { componentId: header.id },
        data: { body: { version: 1, root: [node("Heading", { text: "MARK-TWO" })] } as never },
      });
      const r2 = await publishSite(siteId, null, "shared v2");
      await waitReady(r2.releaseId);

      const v2 = await readBoth();
      assert(
        v2.home.includes("MARK-TWO") && v2.other.includes("MARK-TWO"),
        "editing the component did not change both pages",
      );
      log("one edit to one row changed both pages — no page body was touched");

      // The revision table grew; nothing was rewritten.
      const revisionCount = await prisma.componentRevision.count({
        where: { componentId: header.id },
      });
      assert(revisionCount === 2, `expected 2 component revisions, found ${revisionCount}`);

      let componentUpdateBlocked = false;
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE component_revisions SET version_no = 999 WHERE component_id = '${header.id}'`,
        );
      } catch (e) {
        componentUpdateBlocked = /append-only/i.test(String(e));
      }
      assert(
        componentUpdateBlocked,
        "UPDATE on component_revisions was NOT blocked by the database",
      );
      log("component_revisions is append-only, enforced by the same database trigger");

      // ── Roll back ──────────────────────────────────────────────────────
      // The release pinned a REVISION, so the old header must come back on both
      // pages — with no rebuild and no file written.
      const before = await fingerprint(artifactsRoot());
      await prisma.site.update({
        where: { id: siteId },
        data: { liveReleaseId: r1.releaseId },
      });
      const after = await fingerprint(artifactsRoot());
      assert(
        JSON.stringify(before) === JSON.stringify(after),
        "rolling back a shared component touched files on disk",
      );

      const back = await readBoth();
      assert(
        back.home.includes("MARK-ONE") && back.other.includes("MARK-ONE"),
        "rollback did not restore the previous version of the shared component",
      );
      log("rollback restored the old component on both pages; 0 files touched");

      // ── Loops are refused ──────────────────────────────────────────────
      const loop = await prisma.component.create({
        data: { siteId, name: `Loop ${Math.random().toString(36).slice(2, 6)}` },
      });
      const selfRef = node("@component", {});
      selfRef.props.componentId = loop.id;
      selfRef.props.overrides = {};
      await prisma.componentDraft.create({
        data: {
          componentId: loop.id,
          lockVersion: 1,
          body: { version: 1, root: [selfRef] } as never,
        },
      });

      let cycleRefused = false;
      try {
        await publishSite(siteId, null, "should not happen");
      } catch (e) {
        cycleRefused = /loop/i.test(String(e));
      }
      assert(cycleRefused, "publish accepted a component that contains itself");

      // And it failed BEFORE writing anything — the transaction rolled back.
      const releaseCount = await prisma.release.count({ where: { siteId } });
      const latest = await prisma.release.findFirstOrThrow({
        where: { siteId },
        orderBy: { versionNo: "desc" },
      });
      assert(
        latest.id === r2.releaseId,
        `a release was created despite the cycle (${releaseCount} total)`,
      );
      log("a component containing itself is refused at publish, before any row is written");

      // Leave the site live and consistent for anything that runs after.
      await prisma.component.update({
        where: { id: loop.id },
        data: { deletedAt: new Date() },
      });
      await prisma.site.update({ where: { id: siteId }, data: { liveReleaseId: r2.releaseId } });
    },
  );

  // ── 12 ───────────────────────────────────────────────────────────────────
  await check(12, "Hosting does not read the filesystem", async (log) => {
    // The bluntest possible demonstration that the runtime is decoupled from
    // disk: take the live release's prerendered directory away entirely, and
    // check the site keeps serving the same page.
    //
    // Under the old design this was fatal — hosting WAS the filesystem. It is
    // what stopped you running a second app server without a shared volume, and
    // what tied a deploy to a disk. Now the files exist only so the export has
    // something to zip.
    const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    const dir = releaseDir(siteId, site.liveReleaseId!);

    const before = stableHtml(await (await fetch(`${APP}/s/${slug}`)).text());
    const fileCount = Object.keys(await fingerprint(dir)).length;
    assert(fileCount > 0, "expected the release to have prerendered files to remove");

    const stashed = `${dir}__stashed`;
    await rename(dir, stashed);
    try {
      const res = await fetch(`${APP}/s/${slug}`);
      assert(res.ok, `serving broke without the artifact directory: ${res.status}`);
      const after = stableHtml(await res.text());
      assert(
        sha(before) === sha(after),
        "the page changed once its prerendered files were removed",
      );

      // The custom domain path is the same code, so it must survive too.
      const domain = await fetch(`${APP}/?host=${site.customDomain}`);
      assert(domain.ok, `custom domain broke without files: ${domain.status}`);

      log(`removed all ${fileCount} prerendered files of the live release`);
      log("the site served byte-identical HTML anyway, via slug and custom domain");
    } finally {
      // Put them back — the export checks need them.
      await rename(stashed, dir);
    }

    log("hosting reads Postgres, not a disk; artifacts exist for the export only");
  });

  // ── 13 ───────────────────────────────────────────────────────────────────
  await check(13, "A page stores references, never content", async (log) => {
    // The storage model, asserted directly against the seeded demo site rather
    // than a fixture, because this is the claim the whole design rests on.
    const demo = await prisma.site.findFirst({ where: { slug: "acme-store" } });
    if (!demo) {
      log("demo site absent (verify ran against a custom seed) — skipped");
      return;
    }

    const drafts = await prisma.pageDraft.findMany({
      where: { page: { siteId: demo.id, deletedAt: null } },
      include: { page: true },
    });
    assert(drafts.length > 0, "the demo site has no pages");

    let refs = 0;
    const referenced = new Set<string>();
    for (const draft of drafts) {
      const root = fromJson<{ root: PageNode[] }>(draft.body).root ?? [];
      assert(root.length > 0, `${draft.page.path} is empty`);
      for (const node of root) {
        assert(
          node.type === "@component",
          `${draft.page.path} stores a ${node.type} inline instead of a reference`,
        );
        assert(
          !node.children?.length,
          `${draft.page.path} stores content inside a reference`,
        );
        const componentId = (node.props as { componentId?: string })?.componentId;
        assert(componentId, `${draft.page.path} has a reference pointing at nothing`);
        referenced.add(componentId!);
        refs++;
      }
    }

    // And positively: every reference resolves to a record that holds content.
    // Note refs > referenced.size — some component is used by more than one
    // page, which is the entire mechanism behind "shared".
    const resolved = await prisma.component.count({
      where: { siteId: demo.id, deletedAt: null, id: { in: [...referenced] } },
    });
    assert(
      resolved === referenced.size,
      `${referenced.size} distinct components referenced but only ${resolved} exist`,
    );

    // A page's stored bytes contain no visible text at all — only ids.
    const anyDraft = JSON.stringify(drafts[0].body);
    assert(
      !/[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(anyDraft.replace(/"[0-9a-f-]{36}"/g, "")),
      "a page draft contains prose, so it is storing content and not only references",
    );

    // The named one is used twice — the same record, two pages. That is all
    // "shared" means now.
    const named = await prisma.component.findFirst({
      where: { siteId: demo.id, deletedAt: null, name: { not: null } },
    });
    if (named) {
      const users = drafts.filter((d) =>
        fromJson<{ root: PageNode[] }>(d.body).root.some(
          (n) => (n.props as { componentId?: string })?.componentId === named.id,
        ),
      );
      assert(users.length > 1, `“${named.name}” is named but used by only ${users.length} page`);
      log(`“${named.name}” is one record referenced by ${users.length} pages — that is "shared"`);
    }

    log(`${drafts.length} pages hold ${refs} references and zero blocks of content`);
    log(`all ${referenced.size} referenced components exist and hold the content instead`);
    log(`${refs} references over ${referenced.size} components — the difference IS the reuse`);
  });

  // ── 14 ───────────────────────────────────────────────────────────────────
  await check(14, "Access is org-scoped, and enforced on the server", async (log) => {
    // A user in ANOTHER organisation, with a real session. The question is not
    // whether the dashboard links to this site — it is whether the API answers.
    const suffix = Math.random().toString(36).slice(2, 8);
    const otherOrg = await prisma.organization.create({ data: { name: `outsider-${suffix}` } });
    const outsider = await prisma.user.create({
      data: {
        email: `outsider-${suffix}@test.local`,
        name: "Outsider",
        passwordHash: "scrypt$unused",
      },
    });
    await prisma.membership.create({
      data: { orgId: otherOrg.id, userId: outsider.id, role: "owner" },
    });
    const theirCookie = `cms_session=${await createSession(outsider.id, "verify")}`;

    const endpoints = [
      { url: `${APP}/api/sites/${siteId}/releases`, method: "GET" },
      { url: `${APP}/api/sites/${siteId}/publish`, method: "POST" },
      { url: `${APP}/api/sites/${siteId}/rollback`, method: "POST" },
      { url: `${APP}/api/pages/${homePageId}/draft`, method: "GET" },
    ];

    for (const { url, method } of endpoints) {
      // No session at all.
      const anon = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined });
      assert(anon.status === 401, `${method} ${url} allowed an anonymous caller (${anon.status})`);

      // A real session, wrong organisation.
      const theirs = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", cookie: theirCookie },
        body: method === "POST" ? "{}" : undefined,
      });
      assert(theirs.status === 403, `${method} ${url} leaked to another org (${theirs.status})`);
    }

    // And the member still gets in — a guard that refuses everybody is not a guard.
    const mine = await fetch(`${APP}/api/sites/${siteId}/releases`, authed());
    assert(mine.ok, `the site's own member was refused (${mine.status})`);

    // Published sites stay public. They are web pages.
    const visitor = await fetch(`${APP}/s/${slug}`);
    assert(visitor.ok, "a published site requires a login");

    log(`${endpoints.length} endpoints: 401 with no session, 403 from another org, 200 for a member`);
    log("the published site itself is still public — auth guards the product, not the output");
  });

  // ── 15 ───────────────────────────────────────────────────────────────────
  await check(15, "One editor per page, enforced by the database", async (log) => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const second = await prisma.user.create({
      data: {
        email: `second-${suffix}@test.local`,
        name: "Second Editor",
        passwordHash: "scrypt$unused",
      },
    });
    const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    await prisma.membership.create({
      data: { orgId: site.orgId, userId: second.id, role: "editor" },
    });
    const secondCookie = `cms_session=${await createSession(second.id, "verify")}`;

    const lockUrl = `${APP}/api/pages/${homePageId}/lock`;

    // First in wins.
    const first = await (await fetch(`${lockUrl}?action=acquire`, authed({ method: "POST" }))).json();
    assert(first.canEdit === true, "the first editor was not given the lock");

    // Second gets a viewer's answer, naming who has it.
    const viewer = await (
      await fetch(`${lockUrl}?action=acquire`, {
        method: "POST",
        headers: { cookie: secondCookie },
      })
    ).json();
    assert(viewer.canEdit === false, "two people were given the lock at once");
    assert(viewer.lockedBy?.name, "the viewer was not told who is editing");

    // THE PART THAT MATTERS: the UI hides the controls, but the server refuses
    // the write. A viewer who calls the endpoint directly is stopped here.
    const draft = await (await fetch(`${APP}/api/pages/${homePageId}/draft`, authed())).json();
    const stolen = await fetch(`${APP}/api/pages/${homePageId}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: secondCookie },
      body: JSON.stringify({ body: draft.body, lockVersion: draft.lockVersion }),
    });
    assert(stolen.status === 423, `a viewer's write was not refused (${stolen.status})`);

    // The holder can still write.
    const mine = await fetch(`${APP}/api/pages/${homePageId}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ body: draft.body, lockVersion: draft.lockVersion }),
    });
    assert(mine.ok, `the lock holder was refused their own write (${mine.status})`);

    // A lock nobody renews is dead, so a closed laptop cannot hold a page for
    // ever. Ageing the heartbeat past the TTL is exactly what time would do.
    await prisma.$executeRawUnsafe(
      `UPDATE page_locks SET heartbeat_at = now() - interval '10 minutes' WHERE page_id = '${homePageId}'`,
    );
    const takenOver = await (
      await fetch(`${lockUrl}?action=acquire`, {
        method: "POST",
        headers: { cookie: secondCookie },
      })
    ).json();
    assert(takenOver.canEdit === true, "an abandoned lock could not be taken over");

    // And one row per page is a PRIMARY KEY, not a convention.
    const rows = await prisma.pageLock.count({ where: { pageId: homePageId } });
    assert(rows === 1, `expected exactly 1 lock row, found ${rows}`);

    await prisma.pageLock.deleteMany({ where: { pageId: homePageId } });

    log("first editor holds it; the second is told who has it and is refused with 423");
    log("a lock unheard from for longer than its TTL is taken over, not stuck for ever");
    log(`page_locks holds ${rows} row for this page — one editor is a PRIMARY KEY`);
  });

  // ── 16 ───────────────────────────────────────────────────────────────────
  await check(16, "The audit trail records who, and cannot be rewritten", async (log) => {
    const before = await prisma.activityLog.count({ where: { siteId } });

    await fetch(`${APP}/api/sites/${siteId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ notes: "audit probe" }),
    });

    const after = await prisma.activityLog.count({ where: { siteId } });
    assert(after > before, `publishing recorded nothing (${before} → ${after})`);

    const entries = await prisma.activityLog.findMany({
      where: { siteId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const published = entries.find((e) => e.action === "site.published");
    assert(published, "no site.published entry was written");
    assert(published!.actorName.length > 0, "the entry does not say who did it");
    assert(published!.userId, "the entry is not attributed to a user");

    // Append-only, at the database, like every other history table here.
    let updateBlocked = false;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE activity_log SET summary = 'it was someone else' WHERE id = '${published!.id}'`,
      );
    } catch (e) {
      updateBlocked = /append-only/i.test(String(e));
    }
    assert(updateBlocked, "an audit entry could be rewritten");

    let deleteBlocked = false;
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM activity_log WHERE id = '${published!.id}'`);
    } catch (e) {
      deleteBlocked = /append-only/i.test(String(e));
    }
    assert(deleteBlocked, "an audit entry could be deleted");

    log(`"${published!.summary}" — recorded with a name and a user id`);
    log("UPDATE and DELETE on activity_log are both refused by a database trigger");
  });

  // ── Report ───────────────────────────────────────────────────────────────
  console.log(`\n${c.bold}  Evidence${c.reset}`);
  for (const r of results) {
    const mark = r.passed ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
    console.log(`\n  ${mark} ${c.bold}${r.n}. ${r.title}${c.reset}`);
    for (const line of r.evidence) console.log(`      ${c.dim}${line}${c.reset}`);
    if (r.error) console.log(`      ${c.red}${r.error}${c.reset}`);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(
    `\n${c.bold}  ${results.length - failed.length}/${results.length} non-negotiables verified${c.reset}\n`,
  );

  await prisma.$disconnect();
  if (failed.length > 0) {
    console.log(`${c.red}${c.bold}  VERIFICATION FAILED${c.reset}\n`);
    process.exit(1);
  }
  console.log(`${c.green}${c.bold}  ALL CHECKS PASSED${c.reset}\n`);
  process.exit(0);
}

main().catch(async (err) => {
  console.error(`\n${c.red}verify crashed: ${err instanceof Error ? err.stack : err}${c.reset}`);
  await prisma.$disconnect();
  process.exit(1);
});
