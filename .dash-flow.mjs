import { chromium } from "playwright";
const OUT = "D:/gradle-tmp/claude/D--tkxel-cms/4135a76e-9dfb-4546-ba1e-3e374f1d86e1/scratchpad/shots";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle" });

// ── publish ────────────────────────────────────────────────────────────────
const first = page.getByRole("button", { name: /Publish for the first time|Publish changes/ }).first();
await first.click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/flow-1-publishing.png`, fullPage: true });
console.log("publishing badge:", await page.locator("text=/Publishing/").first().isVisible().catch(() => false));

await page.getByText(/is live\./).first().waitFor({ timeout: 60000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/flow-2-live.png`, fullPage: true });
console.log("after publish 1:", (await page.locator("h1").innerText()), "|", await page.getByText(/is live\./).first().innerText());

// ── second publish, so there is something to restore ───────────────────────
await page.getByRole("textbox", { name: /Note describing/ }).fill("tweaked the headline");
await page.getByRole("button", { name: "Publish changes" }).click();
await page.getByText(/Version 2 is live\./).first().waitFor({ timeout: 60000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/flow-3-two-versions.png`, fullPage: true });

// ── restore v1 ─────────────────────────────────────────────────────────────
const restore = page.getByRole("button", { name: "roll back to this version" }).first();
await restore.waitFor({ timeout: 20000 });
await restore.click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/flow-4-after-restore-click.png`, fullPage: true });

const anyway = page.getByRole("button", { name: "roll back anyway" });
if (await anyway.isVisible({ timeout: 2000 }).catch(() => false)) {
  console.log("dependency confirm shown");
  await page.screenshot({ path: `${OUT}/flow-4b-confirm.png`, fullPage: true });
  await anyway.click();
}
await page.getByText(/Now serving v\d+/).first().waitFor({ timeout: 20000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/flow-5-restored.png`, fullPage: true });
console.log("restore flash:", await page.getByText(/Now serving v\d+/).first().innerText());

// live site really serves the restored version
const res = await page.request.get("http://localhost:3000/s/acme-store");
console.log("live site:", res.status(), res.headers()["x-cms-release-id"]);

// mobile view of the published state
const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mp = await m.newPage();
await mp.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle" });
await mp.waitForTimeout(1200);
await mp.screenshot({ path: `${OUT}/flow-6-mobile.png`, fullPage: true });
const met = await mp.evaluate(() => ({ sw: document.body.scrollWidth, cw: document.body.clientWidth }));
console.log("mobile overflow:", JSON.stringify(met));
const tab = await browser.newContext({ viewport: { width: 768, height: 1000 } });
const tp = await tab.newPage();
await tp.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle" });
await tp.waitForTimeout(1000);
await tp.screenshot({ path: `${OUT}/flow-7-tablet.png`, fullPage: true });

console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console/page errors");
await browser.close();
