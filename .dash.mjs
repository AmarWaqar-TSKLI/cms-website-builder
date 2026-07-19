import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.SHOT_DIR || "D:/gradle-tmp/claude/D--tkxel-cms/4135a76e-9dfb-4546-ba1e-3e374f1d86e1/scratchpad/shots";
mkdirSync(OUT, { recursive: true });
const tag = process.argv[2] || "run";

const browser = await chromium.launch();
const errors = [];

async function shot(path, name, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${name}] console: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.goto("http://localhost:3000" + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${tag}-${name}-${w}.png`, fullPage: true });
  if (w === 390) {
    const m = await page.evaluate(() => ({ sw: document.body.scrollWidth, cw: document.body.clientWidth }));
    console.log(`OVERFLOW ${name}@390: scrollWidth=${m.sw} clientWidth=${m.cw} ${m.sw === m.cw ? "OK" : "*** OVERFLOW ***"}`);
  }
  await ctx.close();
}

for (const [path, name] of [["/dashboard", "dash"], ["/dashboard/products", "products"]]) {
  await shot(path, name, 1440, 900);
  await shot(path, name, 768, 1000);
  await shot(path, name, 390, 844);
}

console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console/page errors");
await browser.close();
