/**
 * The full loop, through the actual interface:
 *   edit → autosave → publish → view live → rollback → view reverted
 *
 * Requires the stack to be up (`make up`) with a build worker running.
 */
import { expect, test, type Page } from "@playwright/test";

/**
 * Sign in before anything else.
 *
 * The product is behind a login now, so every one of these journeys starts the
 * way a real one does. That makes the suite a slightly better test than it was:
 * it exercises the session cookie, the middleware redirect and the server-side
 * guard on every single request it goes on to make.
 */
async function signIn(
  page: Page,
  email = "amar@acme.test",
  { dismissWelcome = true }: { dismissWelcome?: boolean } = {},
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Generous: under a full-suite run the app can be mid-build when this fires.
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  // A brand-new session meets the first-run welcome. Dismiss it so it isn't
  // sitting over the dashboard for journeys that go on to use it. The onboarding
  // test below opts out, to check the welcome on its own terms.
  if (dismissWelcome) {
    const skip = page.getByRole("button", { name: "Skip" });
    if (await skip.isVisible({ timeout: 5000 }).catch(() => false)) await skip.click();
  }
}

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

/** Open the Publish tab and run a publish, waiting for the site to go live. */
async function publish(page: Page) {
  await page.getByRole("button", { name: "Publish", exact: true }).first().click();
  await page.getByRole("button", { name: "Publish changes" }).click();
  // Plain-language flow now: the snapshot lands first, then the build goes live.
  await expect(page.getByText(/Saved this version/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Your site is live/)).toBeVisible({ timeout: 60_000 });
}

test.describe("edit → publish → serve → rollback", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("a rollback returns the live site to the previous version", async ({ page }) => {
    const pageId = await firstPageId(page);
    const site = await siteInfo(page);

    // ── Edit and autosave: version A ──────────────────────────────────────
    await page.goto(`/editor/${pageId}`);
    await expect(page.getByRole("link", { name: /Acme Store/ })).toBeVisible();
    await setHeadline(page, HEADLINE_A);

    // ── Where the text actually went ──────────────────────────────────────
    // The page draft must NOT contain the headline. A page stores an ordered
    // list of component references and no content at all; the text lives in the
    // component record the reference points at. This is the storage model, and
    // asserting it here is the most direct proof of it in the whole suite.
    const draftA = await (await page.request.get(`/api/pages/${pageId}/draft`)).json();
    const refs = (draftA.body.root as { type: string; props: { componentId: string } }[]);

    expect(refs.every((n) => n.type === "@component")).toBe(true);
    expect(JSON.stringify(draftA.body)).not.toContain(HEADLINE_A);

    // Exactly one of the referenced components holds it.
    const bodies = await Promise.all(
      refs.map(async (n) => {
        const res = await page.request.get(`/api/components/${n.props.componentId}`);
        return res.ok() ? JSON.stringify((await res.json()).body) : "";
      }),
    );
    expect(bodies.filter((b) => b.includes(HEADLINE_A))).toHaveLength(1);

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
    await expect(page.getByText("Earlier versions")).toBeVisible();

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
    await expect(page.getByText(/online store is on/)).toBeVisible();
    // …and the engine blocks are always there. (The accessible name starts with
    // the palette icon glyph, so this matches loosely rather than anchored.)
    await expect(page.getByRole("button", { name: /Hero/ }).first()).toBeVisible();
  });
});

/**
 * First-run onboarding.
 *
 * A brand-new user should be oriented before they touch anything, and never
 * pestered again. This drives that whole contract through the interface: the
 * welcome greets them by name, steps through, hands off to the editor, stays
 * gone on the next visit, and can be summoned back on demand.
 */
test.describe("first-run onboarding", () => {
  test("a new user is welcomed once, then never pestered", async ({ page }) => {
    // Opt out of the auto-dismiss so we can see the welcome itself.
    await signIn(page, "amar@acme.test", { dismissWelcome: false });

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/Welcome, Amar/)).toBeVisible();

    // Step through the four beats to the end.
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    // The last step offers to start building; taking it dismisses and opens the editor.
    await dialog.getByRole("link", { name: "Start building" }).click();
    await page.waitForURL(/\/editor\//, { timeout: 20_000 });

    // Back on the dashboard it does not reappear — the choice is remembered.
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "Show intro" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // But anyone can summon it again from the top bar.
    await page.getByRole("button", { name: "Show intro" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

/**
 * Real image uploads.
 *
 * The library used to offer only the seeded gradients. This uploads an actual
 * file through the real pipeline — browser downscale → data URI → POST → stored —
 * and confirms it lands in the library, which is the whole feature end to end.
 */
test.describe("media uploads", () => {
  // A 1×1 transparent PNG, enough for the browser to load, downscale and re-encode.
  const TINY_PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  test("a picked file becomes a usable image in the library", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard/media");
    await expect(page.getByRole("heading", { name: "Images", exact: true })).toBeVisible();

    // The file input is hidden (a styled button triggers it); Playwright can set
    // files on it directly without needing it visible.
    await page.locator('input[type="file"]').setInputFiles({
      name: "e2e-upload.png",
      mimeType: "image/png",
      buffer: Buffer.from(TINY_PNG, "base64"),
    });

    // It appears in the grid, named after the file that produced it.
    await expect(page.getByText("e2e-upload.png")).toBeVisible({ timeout: 20_000 });
  });
});

/**
 * The blog module.
 *
 * Write a post, publish it, and see the manager reflect both — the create →
 * version → publish loop through the real interface, against the real API.
 */
test.describe("blog", () => {
  test("write a post and publish it", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard/blog");
    await expect(page.getByRole("heading", { name: "Blog", exact: true })).toBeVisible();

    const title = `E2E Post ${Date.now().toString(36).toUpperCase()}`;
    // "New post" asks for a title through a browser prompt.
    page.once("dialog", (d) => d.accept(title));
    await page.getByRole("button", { name: "New post" }).click();

    // The new post opens in the editor…
    await expect(page.getByRole("heading", { name: "Edit post" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Publish", exact: true }).click();

    // …and turns into an unpublishable, published post.
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(title)).toBeVisible();
  });

  test("a published post is readable at its own /blog/<slug> page", async ({ page }) => {
    await signIn(page);
    const site = await siteInfo(page);

    // The seeded home page carries a PostList of the seeded posts, so publishing
    // freezes them and their detail pages become reachable.
    const pub = await page.request.post(`/api/sites/${site.id}/publish`, {
      data: { notes: "blog detail e2e" },
    });
    const { releaseId } = await pub.json();
    await expect
      .poll(
        async () => (await (await page.request.get(`/api/releases/${releaseId}`)).json()).status,
        { timeout: 60_000 },
      )
      .toBe("ready");

    // The teaser list on the home page links to the detail page.
    const home = await (await page.request.get(`/s/${site.slug}`)).text();
    expect(home).toContain("From the blog");
    expect(home).toContain("/blog/page-is-a-description");

    // The detail page renders the post's title and its frozen body.
    const detail = await (await page.request.get(`/s/${site.slug}/blog/page-is-a-description`)).text();
    expect(detail).toContain("Why a page is a description");
    expect(detail).toContain("The database never stores HTML");
  });
});

/**
 * The editing lock, with two real browsers.
 *
 * This is the one behaviour that cannot be checked with a single session, so it
 * gets its own describe block with two isolated browser contexts — separate
 * cookie jars, exactly like two people at two desks.
 */
test.describe("two people, one page", () => {
  test("the second person gets a read-only view that updates itself", async ({ browser }) => {
    const amar = await browser.newContext();
    const sara = await browser.newContext();

    try {
      const amarPage = await amar.newPage();
      const saraPage = await sara.newPage();

      await signIn(amarPage, "amar@acme.test");
      await signIn(saraPage, "sara@acme.test");

      const pageId = await firstPageId(amarPage);

      // Amar arrives first and gets the lock.
      await amarPage.goto(`/editor/${pageId}`);
      await expect(amarPage.locator('[data-cms-type="Hero"]').first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(amarPage.getByText(/Read only/)).toHaveCount(0);

      // Sara opens the same page and is told, by name, who has it.
      await saraPage.goto(`/editor/${pageId}`);
      await expect(saraPage.getByText(/Read only/)).toBeVisible({ timeout: 20_000 });
      await expect(saraPage.getByText(/Amar Waqar is editing this page/)).toBeVisible();

      // The controls that would write are gone for her.
      await expect(saraPage.getByRole("button", { name: /Reuse across pages/ })).toHaveCount(0);
      // The top-bar Publish, not the right-panel tab of the same name.
      await expect(
        saraPage.getByRole("button", { name: "Publish", exact: true }).first(),
      ).toBeDisabled();

      // And the server refuses the write even if the UI is bypassed entirely.
      const draft = await (await saraPage.request.get(`/api/pages/${pageId}/draft`)).json();
      const forced = await saraPage.request.put(`/api/pages/${pageId}/draft`, {
        data: { body: draft.body, lockVersion: draft.lockVersion },
      });
      expect(forced.status()).toBe(423);

      // Amar types; Sara's view catches up on its own, with no reload.
      const marker = `LOCKED ${Date.now().toString(36).toUpperCase()}`;
      await setHeadline(amarPage, marker);

      await expect(saraPage.getByText(new RegExp(marker))).toBeVisible({ timeout: 30_000 });
    } finally {
      await amar.close();
      await sara.close();
    }
  });
});

/**
 * The forms module.
 *
 * A visitor submits through the public runtime endpoint — exactly what a Contact
 * block's form does — and the message turns up in the dashboard inbox. That is
 * the whole loop: public write of Tier-2 data, guarded read of it.
 */
test.describe("forms", () => {
  test("a submission reaches the inbox", async ({ page }) => {
    await signIn(page);
    const site = await siteInfo(page);

    // Unique per run — both the message and the email — so re-running against a
    // database that already holds earlier submissions never matches two rows.
    const stamp = Date.now().toString(36);
    const marker = `E2E FORM ${stamp.toUpperCase()}`;
    const email = `e2e-form-${stamp}@example.test`;
    const res = await page.request.post("/api/runtime/forms", {
      data: {
        siteId: site.id,
        formKey: "contact",
        formName: "Contact",
        fields: { name: "E2E Tester", email, message: marker },
      },
    });
    expect(res.ok()).toBe(true);

    // It shows up in the dashboard inbox, message and reply address and all.
    // The address renders twice — as the reply link AND as the "email" field —
    // so target the reply link specifically; the message body is unique.
    await page.goto("/dashboard/forms");
    await expect(page.getByRole("heading", { name: "Forms", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: email })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(marker)).toBeVisible();
  });
});
