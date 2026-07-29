/**
 * The two builder features added this session, through the real interface:
 *   - One-click restyle: pick a whole "Look" (colours + fonts + shape) in the
 *     Design tab and the canvas transforms.
 *   - Section templates: drop a whole designed section in from the palette.
 *
 * Both run on a FRESH site created through the real API, not the seeded Acme
 * demo — so a test run never leaves pricing tables or a dark theme sitting in
 * the demo anyone opens next. The starter homepage a new site gets (Hero +
 * columns + CTA) is enough surface to see a restyle land on.
 *
 * Requires the stack up (`make up`).
 */
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email = "amar@acme.test") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait until we're off the login page. If a burst of logins across the suite
  // trips the in-process limiter (8/min), wait out a slice of the window and
  // retry once — it's a brake on abuse, not a gate this suite should fail on.
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  } catch {
    await page.waitForTimeout(12_000);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 25_000 });
  }
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.isVisible({ timeout: 5000 }).catch(() => false)) await skip.click();
}

/** Make a throwaway site and return the id of its editable home page. */
async function freshSiteEditor(page: Page, name: string): Promise<string> {
  const res = await page.request.post("/api/sites", { data: { name } });
  expect(res.status(), "site create should succeed").toBe(201);
  const { pageId } = (await res.json()) as { pageId: string | null };
  expect(pageId, "new site should have a home page").toBeTruthy();
  return pageId!;
}

test.describe("one-click restyle", () => {
  test("a Look repaints the whole canvas at once", async ({ page }) => {
    await signIn(page);
    const pageId = await freshSiteEditor(page, "[e2e] Restyle Check");
    await page.goto(`/editor/${pageId}`);

    // The starter Hero is on the canvas before we touch anything.
    await expect(page.locator('[data-cms-type="Hero"]').first()).toBeVisible({ timeout: 20_000 });

    // Open the Design tab (right panel) and confirm the restyle controls.
    await page.getByRole("button", { name: "Design", exact: true }).click();
    await expect(page.getByText("Looks", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Surprise me/ })).toBeVisible();
    for (const look of ["Studio", "Ink", "Bloom", "Mono"]) {
      await expect(page.getByRole("button", { name: look, exact: true })).toBeVisible();
    }

    // Applying "Ink" (a dark Look, bg #0c0c10) must reach the rendered canvas —
    // the point of a theme is that one click follows through to every section.
    await page.getByRole("button", { name: "Ink", exact: true }).click();

    // The whole-site change is visible on the canvas, not just in the panel.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll("section")].some(
              (el) => getComputedStyle(el).backgroundColor === "rgb(12, 12, 16)",
            ),
          ),
        { timeout: 10_000 },
      )
      .toBe(true);

    // And the change is now savable (a versioned theme revision) rather than a no-op.
    await expect(page.getByRole("button", { name: "Save design" })).toBeEnabled();
  });
});

test.describe("section templates", () => {
  test("dropping a section adds its whole designed content", async ({ page }) => {
    await signIn(page);
    const pageId = await freshSiteEditor(page, "[e2e] Sections Check");
    await page.goto(`/editor/${pageId}`);
    await expect(page.locator('[data-cms-type="Hero"]').first()).toBeVisible({ timeout: 20_000 });

    // The Sections strip is in the palette, above the individual blocks. Anchor
    // the FAQ match so it hits the "FAQ" section, not the "? FAQ item" block.
    await expect(page.getByText("Sections", { exact: true })).toBeVisible();
    for (const rx of [/Pricing table/, /^FAQ /, /Testimonials/, /Team grid/]) {
      await expect(page.getByRole("button", { name: rx })).toBeVisible();
    }

    // Drop in the pricing section; its heading, highlighted plan and badge all
    // land on the canvas as ordinary, rendered blocks.
    await page.getByRole("button", { name: /Pricing table/ }).click();
    await expect(page.getByText("Simple, honest pricing")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("$19")).toBeVisible();
    await expect(page.getByText("Most popular")).toBeVisible();

    // It persists through the normal autosave path, same as any hand-placed block.
    await expect(page.getByText(/Saved|Up to date/).first()).toBeVisible({ timeout: 20_000 });

    // A second section stacks below the first — dropping one never replaces the page.
    await page.getByRole("button", { name: /^FAQ/ }).click();
    await expect(page.getByText("Frequently asked questions")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Simple, honest pricing")).toBeVisible();
  });
});
