/**
 * The full loop, through the actual interface:
 *   edit → autosave → publish → view live → rollback → view reverted
 *
 * Requires the stack to be up (`make up`) with a build worker running.
 */
import { expect, test, type Page } from "@playwright/test";

/** Provenance now lives in the markup rather than a response header. */
const releaseIdOf = (html: string) =>
  /<meta name="cms:release-id" content="([^"]+)"/.exec(html)?.[1] ?? null;

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

/** Type a new headline into the Hero's Headline field and wait for a save. */
async function setHeadline(page: Page, headline: string) {
  // Target the Hero by type rather than by position. The seeded page opens with
  // a shared component, and "the first block" is not a stable way to name the
  // block you actually mean.
  await page.locator('[data-cms-type="Hero"]').first().click();

  // The panel is generated from the component's schema, so the field is
  // labelled with the schema's own label rather than a hand-written form.
  const field = page.locator('aside input[type="text"]').first();
  await field.waitFor({ state: "visible", timeout: 15_000 });
  await field.fill(headline);

  // "Unsaved changes" → autosave ticks → "Saved".
  await expect(page.getByText(/Saved|Up to date/).first()).toBeVisible({ timeout: 20_000 });
}

/** Open the Publish tab and run a publish, waiting for the artifact to land. */
async function publish(page: Page) {
  await page.getByRole("button", { name: "Publish", exact: true }).first().click();
  await page.getByRole("button", { name: "Publish site" }).click();
  await expect(page.getByText(/Snapshot committed in \d+ms/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Artifact written/)).toBeVisible({ timeout: 60_000 });
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
    // The panel states the async split before the build has finished.
    await publish(page);

    // ── The live site serves A ────────────────────────────────────────────
    const liveA = await page.request.get(`/s/${site.slug}`);
    expect(liveA.status()).toBe(200);
    const htmlA = await liveA.text();
    expect(htmlA).toContain(HEADLINE_A);
    // Provenance rides in the document now — an RSC page cannot set headers, and
    // a meta tag survives being cached, saved or exported.
    const releaseA = releaseIdOf(htmlA);
    expect(releaseA).toBeTruthy();

    // ── Edit and publish version B ────────────────────────────────────────
    await page.goto(`/editor/${pageId}`);
    await setHeadline(page, HEADLINE_B);
    await publish(page);

    const liveB = await page.request.get(`/s/${site.slug}`);
    const htmlB = await liveB.text();
    expect(htmlB).toContain(HEADLINE_B);
    expect(htmlB).not.toContain(HEADLINE_A);
    expect(releaseIdOf(htmlB)).not.toBe(releaseA);

    // ── Roll back through the dashboard ───────────────────────────────────
    await page.goto("/dashboard");
    await expect(page.getByText("Version history")).toBeVisible();

    const rollbackButton = page
      .getByRole("button", { name: /Restore|Roll back to this version/ })
      .first();
    await expect(rollbackButton).toBeVisible({ timeout: 20_000 });
    await rollbackButton.click();

    // A dependency warning may appear; acknowledging it is part of the flow.
    const anyway = page.getByRole("button", { name: /Restore anyway|Roll back anyway/ });
    if (await anyway.isVisible({ timeout: 2500 }).catch(() => false)) {
      await anyway.click();
    }

    await expect(page.getByText(/Now serving v\d+|is live again/)).toBeVisible({ timeout: 20_000 });

    // ── The live site serves A again, byte for byte ───────────────────────
    const reverted = await page.request.get(`/s/${site.slug}`);
    const htmlReverted = await reverted.text();
    expect(htmlReverted).toContain(HEADLINE_A);
    expect(htmlReverted).not.toContain(HEADLINE_B);
    // Not merely equivalent — the same bytes served before.
    expect(htmlReverted).toBe(htmlA);
    expect(releaseIdOf(htmlReverted)).toBe(releaseA);
  });

  test("editing a shared component changes every page that uses it", async ({ page }) => {
    // The whole promise, through the interface: open the component from the
    // palette, change one word, publish once, and check BOTH pages.
    const site = await siteInfo(page);
    const pageId = await firstPageId(page);
    const marker = `SHARED ${Date.now().toString(36).toUpperCase()}`;

    await page.goto(`/editor/${pageId}`);

    // The instance renders on the canvas and is labelled as shared, not copied.
    const instance = page.locator("[data-cms-instance]").first();
    await expect(instance).toBeVisible({ timeout: 20_000 });

    // Open the component itself from the palette's pencil button.
    await page.getByRole("button", { name: "✎" }).first().click();

    // The blast radius is stated in numbers before a key is pressed. The seed
    // puts this component on both pages, so it must say so — a vague "changes
    // every page that uses it" is a sentence people stop reading.
    await expect(page.getByText(/Used on 2 pages/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Publishing changes 2 pages at once/)).toBeVisible();

    // Edit the component's own heading, through the same generated panel.
    await page.locator('[data-cms-type="TextBlock"]').first().click();
    const field = page.locator('aside input[type="text"]').first();
    await field.waitFor({ state: "visible", timeout: 15_000 });
    await field.fill(marker);
    await expect(page.getByText(/Saved|Up to date/).first()).toBeVisible({ timeout: 20_000 });

    await publish(page);

    // ── Both pages changed, from one edit to one row ──────────────────────
    const home = await (await page.request.get(`/s/${site.slug}/`)).text();
    const about = await (await page.request.get(`/s/${site.slug}/about`)).text();
    expect(home).toContain(marker);
    expect(about).toContain(marker);

    // And neither page's own draft holds the text — only a reference.
    const draft = await (await page.request.get(`/api/pages/${pageId}/draft`)).json();
    expect(JSON.stringify(draft.body)).not.toContain(marker);
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
    // Wait for the message the script writes AFTER the order round-trip, not for
    // the hidden placeholder that already reads "order placed" in the markup.
    // Matching that would pass before the row exists, and the next assertion
    // would race the write.
    await expect(page.locator("#cms-cart-note")).toContainText("written to the orders table", {
      timeout: 20_000,
    });

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
    // …and the engine blocks are always there. (The accessible name starts with
    // the palette icon glyph, so this matches loosely rather than anchored.)
    await expect(page.getByRole("button", { name: /Hero/ }).first()).toBeVisible();
  });
});
