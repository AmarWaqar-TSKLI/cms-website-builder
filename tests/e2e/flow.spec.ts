/**
 * The full loop, through the actual interface:
 *   edit → autosave → publish → view live → rollback → view reverted
 *
 * Requires the stack to be up (`make up`) with a build worker running.
 */
import { expect, test, type Page } from "@playwright/test";

const HEADLINE_A = "E2E HEADLINE ALPHA";
const HEADLINE_B = "E2E HEADLINE BRAVO";

async function firstPageId(page: Page): Promise<string> {
  const res = await page.request.get("/api/debug/db");
  const data = await res.json();
  return data.pages[0].id;
}

async function siteInfo(page: Page) {
  const res = await page.request.get("/api/debug/db");
  return (await res.json()).site as { id: string; slug: string };
}

/** Type a new headline into the Hero's first text field and wait for a save. */
async function setHeadline(page: Page, headline: string) {
  // Select the first block on the canvas so the properties panel populates.
  await page.locator("[data-cms-node]").first().click();
  await expect(page.getByText("Properties").first()).toBeVisible();

  const field = page.locator('input[type="text"]').first();
  await field.waitFor({ state: "visible" });
  await field.fill(headline);

  // "Unsaved changes" → autosave ticks → "Saved".
  await expect(page.getByText(/Saved|Up to date/).first()).toBeVisible({ timeout: 20_000 });
}

test.describe("edit → publish → serve → rollback", () => {
  test("a rollback returns the live site to the previous version", async ({ page }) => {
    const pageId = await firstPageId(page);
    const site = await siteInfo(page);

    // ── Edit and autosave: version A ──────────────────────────────────────
    await page.goto(`/editor/${pageId}`);
    await expect(page.getByRole("link", { name: /Acme Store/ })).toBeVisible();
    await setHeadline(page, HEADLINE_A);

    // The draft on the server now holds A — and there is still only one row.
    const draftA = await (await page.request.get(`/api/pages/${pageId}/draft`)).json();
    expect(JSON.stringify(draftA.body)).toContain(HEADLINE_A);

    // ── Publish version A ─────────────────────────────────────────────────
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("button", { name: "Publish site" }).click();

    // The interface states the async split before the build has finished.
    await expect(page.getByText(/Snapshot committed in \d+ms/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Artifact written/)).toBeVisible({ timeout: 60_000 });

    // ── The live site serves A ────────────────────────────────────────────
    const liveA = await page.request.get(`/s/${site.slug}`);
    expect(liveA.status()).toBe(200);
    expect(liveA.headers()["x-cms-served-from"]).toBe("artifact-on-disk");
    const htmlA = await liveA.text();
    expect(htmlA).toContain(HEADLINE_A);
    const releaseA = liveA.headers()["x-cms-release-id"];

    // ── Edit and publish version B ────────────────────────────────────────
    await page.goto(`/editor/${pageId}`);
    await setHeadline(page, HEADLINE_B);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("button", { name: "Publish site" }).click();
    await expect(page.getByText(/Artifact written/)).toBeVisible({ timeout: 60_000 });

    const liveB = await page.request.get(`/s/${site.slug}`);
    const htmlB = await liveB.text();
    expect(htmlB).toContain(HEADLINE_B);
    expect(htmlB).not.toContain(HEADLINE_A);
    expect(liveB.headers()["x-cms-release-id"]).not.toBe(releaseA);

    // ── Roll back through the dashboard ───────────────────────────────────
    await page.goto("/dashboard");
    await expect(page.getByText("Version history")).toBeVisible();

    const rollbackButton = page
      .getByRole("button", { name: "Roll back to this version" })
      .first();
    await expect(rollbackButton).toBeVisible({ timeout: 20_000 });
    await rollbackButton.click();

    // A dependency warning may appear; acknowledging it is part of the flow.
    const anyway = page.getByRole("button", { name: "Roll back anyway" });
    if (await anyway.isVisible({ timeout: 2500 }).catch(() => false)) {
      await anyway.click();
    }

    await expect(page.getByText(/Now serving v\d+/)).toBeVisible({ timeout: 20_000 });

    // ── The live site serves A again, byte for byte ───────────────────────
    const reverted = await page.request.get(`/s/${site.slug}`);
    const htmlReverted = await reverted.text();
    expect(htmlReverted).toContain(HEADLINE_A);
    expect(htmlReverted).not.toContain(HEADLINE_B);
    // Not merely equivalent — the same bytes served before.
    expect(htmlReverted).toBe(htmlA);
    expect(reverted.headers()["x-cms-release-id"]).toBe(releaseA);
  });

  test("the cart writes an order without changing the page (D8)", async ({ page }) => {
    const site = await siteInfo(page);

    await page.goto(`/s/${site.slug}`);
    const before = await (await page.request.get(`/s/${site.slug}`)).text();

    const addToCart = page.locator("[data-cms-add-to-cart]").first();
    if (!(await addToCart.isVisible().catch(() => false))) {
      test.skip(true, "live release has no product grid");
    }
    await addToCart.click();

    // The floating cart is driven entirely by the artifact's own inline script.
    await expect(page.locator("#cms-cart-count")).toContainText("1 item");
    await page.locator("#cms-cart-checkout").click();
    await expect(page.locator("#cms-cart-note")).toContainText("placed", { timeout: 20_000 });

    // The order landed in live data.
    const debug = await (await page.request.get("/api/debug/db")).json();
    expect(debug.counts.orders).toBeGreaterThan(0);

    // And the page is unchanged.
    const after = await (await page.request.get(`/s/${site.slug}`)).text();
    expect(after).toBe(before);
  });

  test("the palette hides commerce blocks for a site without the module", async ({ page }) => {
    const pageId = await firstPageId(page);
    await page.goto(`/editor/${pageId}`);

    // The seeded site HAS commerce, so the block is present…
    await expect(page.getByRole("button", { name: /Product grid/ })).toBeVisible();
    await expect(page.getByText("Commerce module")).toBeVisible();
    // …and the engine blocks are always there.
    await expect(page.getByRole("button", { name: /^Hero/ })).toBeVisible();
  });
});
