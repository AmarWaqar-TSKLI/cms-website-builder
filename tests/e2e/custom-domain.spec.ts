/**
 * Bring-your-own-domain, through the real interface: connect a domain to a site
 * from the dashboard, prove the pieces that make it real, then disconnect.
 *
 * Runs on a FRESH site (created through the API) so it never leaves a domain
 * stuck on the seeded demo. Each run uses a unique domain because
 * sites.custom_domain is globally UNIQUE — a fixed one would collide on the
 * second run.
 *
 * Requires the stack up (`make up`).
 */
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email = "amar@acme.test") {
  // This spec lands on /dashboard, where the first-run welcome overlay opens and
  // would intercept clicks. It's gated by a per-user localStorage key
  // (`cms.welcomed:<id>`), so short-circuit that lookup before any navigation —
  // deterministic, unlike racing the "Skip" button.
  await page.addInitScript(() => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("cms.welcomed:")) return "1";
      return orig.call(this, key);
    };
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();
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

/** Make a throwaway site and return its id. */
async function freshSite(page: Page, name: string): Promise<string> {
  const res = await page.request.post("/api/sites", { data: { name } });
  expect(res.status(), "site create should succeed").toBe(201);
  const { siteId } = (await res.json()) as { siteId: string };
  expect(siteId).toBeTruthy();
  return siteId;
}

test.describe("custom domain", () => {
  test("connect a domain from the dashboard, then disconnect it", async ({ page }) => {
    await signIn(page);
    const siteId = await freshSite(page, "[e2e] Domain Check");
    const domain = `pw-${Date.now()}.example`;

    await page.goto(`/dashboard?site=${siteId}`);

    // The panel is there, with nothing connected yet.
    await expect(page.getByRole("heading", { name: "Use your own domain" })).toBeVisible();
    const input = page.getByPlaceholder("golotto.com");
    await expect(input).toBeVisible();

    // Connect it through the real form.
    await input.fill(domain);
    await page.getByRole("button", { name: "Connect domain" }).click();

    // The connected state: the domain shows, with a way to remove it.
    await expect(page.getByText(`${domain} ↗`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();

    // The write actually landed: the API reports the domain back.
    const get = await page.request.get(`/api/sites/${siteId}/domain`);
    expect(get.ok()).toBe(true);
    expect((await get.json()).domain).toBe(domain);

    // The on-demand-TLS gate now recognises this domain (so a cert could be
    // issued for it) but not a random one (so a stranger's host can't).
    expect((await page.request.get(`/api/domains/check?domain=${domain}`)).status()).toBe(200);
    expect(
      (await page.request.get(`/api/domains/check?domain=nobody-${Date.now()}.example`)).status(),
    ).toBe(404);

    // apex ↔ www are the same site: the www form is recognised too.
    expect((await page.request.get(`/api/domains/check?domain=www.${domain}`)).status()).toBe(200);

    // Disconnecting brings the add form back.
    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByPlaceholder("golotto.com")).toBeVisible({ timeout: 10_000 });
  });

  test("a domain can belong to only one site (409)", async ({ page }) => {
    await signIn(page);
    const domain = `pw-uniq-${Date.now()}.example`;
    const siteA = await freshSite(page, "[e2e] Domain A");
    const siteB = await freshSite(page, "[e2e] Domain B");

    // First site claims it.
    const first = await page.request.put(`/api/sites/${siteA}/domain`, { data: { domain } });
    expect(first.status()).toBe(200);

    // Second site can't — the UNIQUE column is the guarantee, surfaced as a 409.
    const second = await page.request.put(`/api/sites/${siteB}/domain`, { data: { domain } });
    expect(second.status()).toBe(409);
    expect((await second.json()).error).toContain("already connected");
  });

  test("a nonsense domain is refused with a helpful message (400)", async ({ page }) => {
    await signIn(page);
    const siteId = await freshSite(page, "[e2e] Domain Bad");
    const res = await page.request.put(`/api/sites/${siteId}/domain`, { data: { domain: "notadomain" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });
});
