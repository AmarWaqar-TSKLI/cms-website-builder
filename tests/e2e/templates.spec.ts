/**
 * The template gallery, through the real interface: pick a designed template and
 * land in the editor on a finished, multi-page site with its own look.
 *
 * Runs on a throwaway site (the template creates a brand-new one) so it never
 * touches the seeded demo. Requires the stack up (`make up`).
 */
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email = "amar@acme.test") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Retry once if the in-process login limiter (8/min) braked a suite-wide burst.
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

test.describe("template gallery", () => {
  test("starting from a template builds a designed, multi-page site", async ({ page }) => {
    await signIn(page);
    await page.goto("/templates");

    await expect(page.getByRole("heading", { name: "Start from a template" })).toBeVisible();
    for (const name of ["Portfolio", "Café", "Startup", "Agency"]) {
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    }

    // Use the Agency template — dark theme + two pages, so it proves both that a
    // template's look and its extra pages come through.
    await page
      .locator('[data-template-id="agency"]')
      .getByRole("button", { name: /Use this template/ })
      .click();

    // It creates the site and drops us into the editor on its home page.
    await page.waitForURL(/\/editor\//, { timeout: 30_000 });
    await expect(page.getByText("We make brands people remember")).toBeVisible({ timeout: 20_000 });

    // The template's dark look (bg #0b1220 = rgb(11,18,32)) reached the canvas.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll("section")].some(
              (el) => getComputedStyle(el).backgroundColor === "rgb(11, 18, 32)",
            ),
          ),
        { timeout: 10_000 },
      )
      .toBe(true);

    // The nav carries the template's second page, so it's genuinely multi-page.
    await expect(page.getByText("Work").first()).toBeVisible();
  });
});
