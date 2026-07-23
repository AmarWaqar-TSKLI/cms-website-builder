/**
 * THE D8 PROOF.
 *
 * "Static" never meant "no JavaScript". It meant the page's CONTENT is decided
 * by an immutable release and nothing a visitor does can change it.
 *
 * That claim used to be checked by comparing served bytes to a file on disk.
 * Hosting no longer reads a file, so the check is now the stronger, more direct
 * form of the same statement: place a real order, and assert the page is
 * byte-identical afterwards — while `orders` and stock both moved.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/lib/db";
import { publishSite } from "../../src/lib/publish";
import { releaseDir } from "../../src/lib/paths";
import { APP_URL, createTestSite, releaseIdOf, requireApp, stableHtml } from "../helpers/factory";
import { startWorker, stopWorker, waitForRelease } from "../helpers/worker";

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

describe("static pages, live cart", () => {
  it("writes an order without the page changing by a single byte", async () => {
    await requireApp();
    const site = await createTestSite("d8");
    const child = startWorker();

    try {
      const release = await publishSite(site.siteId, site.userId, "d8");
      expect((await waitForRelease(release.releaseId)).status).toBe("ready");

      // The prerendered file still exists — the export needs it — but hosting
      // does not consult it. Both are checked below, separately.
      const file = path.join(releaseDir(site.siteId, release.releaseId), "index.html");
      const info = await stat(file);
      expect(info.isFile()).toBe(true);
      const hashBefore = sha(await readFile(file, "utf8"));
      const mtimeBefore = info.mtimeMs;

      const res = await fetch(`${APP_URL}/s/${site.slug}`);
      expect(res.status).toBe(200);
      const served = stableHtml(await res.text());

      // The page names the exact release it was rendered from.
      expect(releaseIdOf(served)).toBe(release.releaseId);
      const servedHashBefore = sha(served);

      // The page ships the hooks the cart binds to. On the hosted runtime the
      // fetch URL lives in the client bundle rather than in the markup, so what
      // is asserted here is the contract the markup actually carries — the same
      // attributes the exported artifact's vanilla script binds to.
      expect(served).toContain("data-cms-add-to-cart");
      expect(served).toContain("cms-cart-checkout");

      // ── Now be a visitor: cause a change. ───────────────────────────────
      const ordersBefore = await prisma.order.count({ where: { siteId: site.siteId } });
      const variantId = site.variantIds[0];
      const stockBefore = (
        await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })
      ).inventoryQty;

      const order = await fetch(`${APP_URL}/api/runtime/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: site.siteId,
          releaseId: release.releaseId,
          items: [{ variantId, qty: 2 }],
        }),
      });
      expect(order.status).toBe(200);
      const orderData = await order.json();
      expect(orderData.ok).toBe(true);

      // Live data moved.
      expect(await prisma.order.count({ where: { siteId: site.siteId } })).toBe(ordersBefore + 1);
      const stockAfter = (
        await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })
      ).inventoryQty;
      expect(stockAfter).toBe(stockBefore - 2);

      // ── THE ASSERTION: the page did not. ────────────────────────────────
      const servedAfter = stableHtml(await (await fetch(`${APP_URL}/s/${site.slug}`)).text());
      expect(sha(servedAfter)).toBe(servedHashBefore);

      // And the prerendered copy the export uses is untouched too.
      expect(sha(await readFile(file, "utf8"))).toBe(hashBefore);
      expect((await stat(file)).mtimeMs).toBe(mtimeBefore);
    } finally {
      await stopWorker(child);
    }
  });

  it("snapshots the price at purchase instead of joining to the variant", async () => {
    await requireApp();
    const site = await createTestSite("pricesnap");
    const variantId = site.variantIds[0];

    const original = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } }))
      .priceCents;

    const res = await fetch(`${APP_URL}/api/runtime/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: site.siteId, items: [{ variantId, qty: 1 }] }),
    });
    const { orderId } = await res.json();

    // The shop changes its price afterwards.
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { priceCents: original + 5000 },
    });

    const line = await prisma.orderLineItem.findFirstOrThrow({ where: { orderId } });
    // What they paid is what they paid. History is not rewritten by today's price.
    expect(line.priceAtPurchaseCents).toBe(original);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.totalCents).toBe(original);
  });

  it("takes the price from the database, not from the client", async () => {
    await requireApp();
    const site = await createTestSite("notrust");
    const variantId = site.variantIds[0];
    const real = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } }))
      .priceCents;

    const res = await fetch(`${APP_URL}/api/runtime/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: site.siteId,
        // A hostile (or merely stale) artifact claiming a price of one cent.
        items: [{ variantId, qty: 1, priceCents: 1 }],
      }),
    });
    const { orderId } = await res.json();
    const line = await prisma.orderLineItem.findFirstOrThrow({ where: { orderId } });
    expect(line.priceAtPurchaseCents).toBe(real);
  });

  it("orders survive a rollback — live data is not versioned (D5)", async () => {
    await requireApp();
    const site = await createTestSite("ordersurvive");
    const child = startWorker();

    try {
      const v1 = await publishSite(site.siteId, site.userId, "v1");
      expect((await waitForRelease(v1.releaseId)).status).toBe("ready");
      const v2 = await publishSite(site.siteId, site.userId, "v2");
      expect((await waitForRelease(v2.releaseId)).status).toBe("ready");

      await fetch(`${APP_URL}/api/runtime/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: site.siteId, items: [{ variantId: site.variantIds[0], qty: 1 }] }),
      });
      const ordersBefore = await prisma.order.count({ where: { siteId: site.siteId } });
      expect(ordersBefore).toBe(1);

      await fetch(`${APP_URL}/api/sites/${site.siteId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: v1.releaseId, acknowledgeWarnings: true }),
      });

      // Rolling the site's appearance back to before the order does not
      // un-place it. Exactly one column crossed the boundary, and it wasn't this.
      expect(await prisma.order.count({ where: { siteId: site.siteId } })).toBe(ordersBefore);
    } finally {
      await stopWorker(child);
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
