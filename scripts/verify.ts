/**
 * make verify — the gate.
 *
 * Runs a scripted walkthrough against the live stack and checks all ten
 * non-negotiables, printing PASS/FAIL for each and exiting non-zero on any
 * failure. Where a claim can be checked structurally rather than behaviourally
 * (a trigger, a module import, a table that must not exist), it is — those are
 * the checks that stay true after someone edits the code.
 */
import { loadEnv } from "../src/lib/env";
loadEnv();

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { publishSite } from "../src/lib/publish";
import { artifactsRoot, releaseDir } from "../src/lib/paths";
import { createNode } from "../src/lib/registry";
import type { PageNode } from "../src/lib/registry/types";
import { DEFAULT_LAYOUT, DEFAULT_TOKENS } from "../src/lib/theme";
import { fromJson, toJson } from "../src/lib/json";

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

let node = (type: string, props: Record<string, unknown> = {}): PageNode => {
  const n = createNode(type, `v${Math.random().toString(36).slice(2, 8)}`);
  Object.assign(n.props, props);
  return n;
};

async function setup() {
  const suffix = Math.random().toString(36).slice(2, 8);
  const org = await prisma.organization.create({ data: { name: `verify-${suffix}` } });
  const site = await prisma.site.create({
    data: {
      orgId: org.id,
      name: `Verify ${suffix}`,
      slug: `verify-${suffix}`,
      customDomain: `verify-${suffix}.test`,
    },
  });
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
  console.log(`\n${c.bold}Verifying the ten non-negotiables${c.reset}`);
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
        headers: { "Content-Type": "application/json" },
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
  await check(4, "A revision holds the whole tree", async (log) => {
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

    // There is no per-component revision table to reassemble from.
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
    const names = tables.map((t) => t.table_name);
    assert(
      !names.includes("component_revisions") && !names.includes("node_revisions"),
      "a per-component revision table exists",
    );

    log(`one row holds the full ordered arrangement: ${order.join(" → ")}`);
    await waitReady(r.releaseId);
  });

  // ── 5 ────────────────────────────────────────────────────────────────────
  await check(5, "Publish returns before the build finishes", async (log) => {
    const res = await fetch(`${APP}/api/sites/${siteId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
  await check(7, "Serve the frozen artifact, never re-render at request time", async (log) => {
    const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    const file = path.join(releaseDir(siteId, site.liveReleaseId!), "index.html");
    const onDisk = await readFile(file, "utf8");
    const mtimeBefore = (await stat(file)).mtimeMs;

    const res = await fetch(`${APP}/s/${slug}`);
    assert(res.ok, `live URL returned ${res.status}`);
    const served = await res.text();

    assert(sha(served) === sha(onDisk), "served bytes differ from the file on disk");
    assert(
      res.headers.get("x-cms-served-from") === "artifact-on-disk",
      "response does not declare it came from an artifact",
    );

    // Repeated requests must not touch the file.
    await fetch(`${APP}/s/${slug}`);
    await fetch(`${APP}/s/${slug}`);
    assert((await stat(file)).mtimeMs === mtimeBefore, "serving modified the artifact");

    // Structural: the serving module has no path to a renderer.
    const serveSrc = await readFile(path.resolve("src/lib/serve.ts"), "utf8");
    assert(
      !/from\s+["'].*\/(render|build)["']/.test(serveSrc),
      "src/lib/serve.ts imports the renderer or the builder",
    );

    log(`served bytes === file bytes (sha ${sha(served).slice(0, 12)}…)`);
    log("3 requests, mtime unchanged; serve.ts cannot import a renderer");
  });

  // ── 8 ────────────────────────────────────────────────────────────────────
  await check(8, "Products and orders are never versioned", async (log) => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
    const names = tables.map((t) => t.table_name);
    for (const forbidden of ["product_revisions", "order_revisions", "variant_revisions", "customer_revisions"]) {
      assert(!names.includes(forbidden), `${forbidden} exists — Tier 2 is being versioned`);
    }

    // Nothing but pages and themes may be pinned by a release.
    const kinds = await prisma.releaseItem.findMany({ select: { entityType: true }, distinct: ["entityType"] });
    const kindNames = kinds.map((k) => k.entityType).sort();
    assert(
      kindNames.every((k) => k === "page" || k === "theme"),
      `a release pins something other than pages/themes: ${kindNames.join(",")}`,
    );

    // An order placed now must survive a rollback of the site's appearance.
    const orderRes = await fetch(`${APP}/api/runtime/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ releaseId: releases[releases.length - 1].id, acknowledgeWarnings: true }),
    });

    const stillThere = await prisma.order.findUnique({ where: { id: orderData.orderId } });
    assert(stillThere, "the order vanished when the site rolled back");

    // Deleting live data is soft and is reported through the reverse index.
    const del = await fetch(`${APP}/api/products/${productId}`, { method: "DELETE" });
    assert(del.status === 409, `expected a dependency warning, got ${del.status}`);
    const warning = await del.json();
    assert(warning.references?.length > 0, "no releases reported as referencing the product");

    log(`no *_revisions table for Tier 2; releases pin only [${kindNames.join(", ")}]`);
    log(`order ${orderData.orderId.slice(0, 8)} survived a rollback`);
    log(`deleting a product warned about ${warning.references.length} referencing release(s)`);
  });

  // ── 9 ────────────────────────────────────────────────────────────────────
  await check(9, "Artifacts are immutable", async (log) => {
    const releases = await prisma.release.findMany({
      where: { siteId, status: "ready" },
      orderBy: { versionNo: "asc" },
    });
    const oldest = releases[0];
    const dir = releaseDir(siteId, oldest.id);
    const before = await fingerprint(dir);
    assert(Object.keys(before).length > 0, "the oldest release has no files");

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: target, acknowledgeWarnings: true }),
      });
      await fetch(`${APP}/s/${slug}`);
    }

    const after = await fingerprint(dir);
    assert(
      JSON.stringify(before) === JSON.stringify(after),
      "the oldest release's files changed after later publishes and rollbacks",
    );

    // Rebuilding a succeeded release is refused outright.
    const retry = await fetch(`${APP}/api/releases/${oldest.id}/retry`, { method: "POST" });
    assert(retry.status === 409, `retrying a ready release returned ${retry.status}, expected 409`);

    log(`v${oldest.versionNo}'s ${Object.keys(before).length} files unchanged across 1 publish + 3 rollbacks`);
    log("re-building a succeeded release is refused (409)");
  });

  // ── 10 ───────────────────────────────────────────────────────────────────
  await check(10, "Hosting is the default; export is additive", async (log) => {
    const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    const live = site.liveReleaseId!;

    // Hosted works with no export step having been taken.
    const hosted = await fetch(`${APP}/s/${slug}`);
    assert(hosted.ok, "the hosted URL is not serving");
    const hostedHtml = await hosted.text();
    assert(hosted.headers.get("x-cms-release-id") === live, "hosted URL served the wrong release");

    // The custom domain reaches the same bytes.
    const domain = await fetch(`${APP}/?host=${site.customDomain}`);
    assert(domain.ok, "custom domain routing failed");
    assert(
      sha(await domain.text()) === sha(hostedHtml),
      "the custom domain served different bytes than the slug",
    );

    // Both exports come from the same release and contain the same page.
    for (const kind of ["static", "container"] as const) {
      const res = await fetch(`${APP}/api/releases/${live}/export/${kind}`);
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
