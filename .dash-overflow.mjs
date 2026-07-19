import { chromium } from "playwright";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000" + (process.argv[2] || "/dashboard"), { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
const bad = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.right > document.documentElement.clientWidth + 0.5 || r.left < -0.5) {
      out.push({
        tag: el.tagName,
        cls: (el.className || "").toString().slice(0, 90),
        text: (el.textContent || "").trim().slice(0, 50),
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    }
  }
  return out.slice(0, 20);
});
console.log(JSON.stringify(bad, null, 1));
await browser.close();
