import { chromium } from "playwright";
import fs from "node:fs";

const OUT = process.env.SHOT_DIR || "./.shots";
const URL = "http://localhost:3000/";
const STEPS = 12;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") consoleErrors.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(900);

const height = await page.evaluate(() => document.documentElement.scrollHeight);
console.log(`page height @1440x900: ${height}px`);

const beatAt = async () =>
  page.evaluate(() => {
    const vh = window.innerHeight;
    let best = null;
    let bestArea = 0;
    for (const el of document.querySelectorAll("[data-beat]")) {
      const r = el.getBoundingClientRect();
      const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (vis > bestArea) {
        bestArea = vis;
        best = el.getAttribute("data-beat");
      }
    }
    return { beat: best, pct: Math.round(bestArea / vh * 100) };
  });

const max = height - 900;
const seq = [];
for (let i = 0; i < STEPS; i++) {
  const y = Math.round((max * i) / (STEPS - 1));
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(750);
  const { beat, pct } = await beatAt();
  seq.push(beat);
  const pctScroll = Math.round((y / max) * 100);
  await page.screenshot({ path: `${OUT}/${String(i).padStart(2, "0")}_y${y}_beat${beat}.png` });
  console.log(`step ${String(i).padStart(2)} y=${String(y).padStart(5)} (${String(pctScroll).padStart(3)}%) -> beat ${beat} (${pct}% of viewport)`);
}

// stuck detector
let run = 1;
let worst = { beat: seq[0], run: 1 };
for (let i = 1; i < seq.length; i++) {
  run = seq[i] === seq[i - 1] ? run + 1 : 1;
  if (run > worst.run) worst = { beat: seq[i], run };
}
console.log(`longest consecutive run: beat ${worst.beat} x${worst.run}`);
if (worst.run > 3) console.log(`FAIL: beat ${worst.beat} occupies ${worst.run} consecutive steps`);

// beats never seen at all
const all = await page.evaluate(() =>
  [...document.querySelectorAll("[data-beat]")].map((e) => e.getAttribute("data-beat")),
);
const missing = all.filter((b) => !seq.includes(b));
if (missing.length) console.log(`NOTE: never dominant in a step: ${missing.join(", ")}`);

// finer sweep, purely to eyeball intermediate states of each scene
fs.mkdirSync(`${OUT}/fine`, { recursive: true });
for (let i = 0; i < 26; i++) {
  const y = Math.round((max * i) / 25);
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(620);
  const { beat } = await beatAt();
  await page.screenshot({ path: `${OUT}/fine/${String(i).padStart(2, "0")}_beat${beat}.png` });
}

// horizontal overflow
for (const w of [390, 768, 1440]) {
  await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({
    sw: document.body.scrollWidth,
    cw: document.body.clientWidth,
    dsw: document.documentElement.scrollWidth,
    dcw: document.documentElement.clientWidth,
    h: document.documentElement.scrollHeight,
  }));
  console.log(
    `${w}px: body ${r.sw}/${r.cw} ${r.sw === r.cw ? "OK" : "OVERFLOW"} | doc ${r.dsw}/${r.dcw} | height ${r.h}`,
  );
  if (w !== 1440) {
    await page.screenshot({ path: `${OUT}/w${w}_top.png`, fullPage: false });
    for (const f of [0.32, 0.45, 0.62, 0.8]) {
      await page.evaluate((k) => window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * k), f);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/w${w}_${Math.round(f * 100)}.png` });
    }
  }
}

// reduced motion sanity
const rctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const rpage = await rctx.newPage();
const rErrors = [];
rpage.on("pageerror", (e) => rErrors.push(String(e)));
await rpage.goto(URL, { waitUntil: "networkidle" });
await rpage.waitForTimeout(1200);
const rh = await rpage.evaluate(() => document.documentElement.scrollHeight);
console.log(`reduced-motion height: ${rh}px, errors: ${rErrors.length}`);
for (const [i, y] of [0, 0.25, 0.5, 0.75, 0.98].entries()) {
  await rpage.evaluate((f) => window.scrollTo(0, (document.documentElement.scrollHeight - 900) * f), y);
  await rpage.waitForTimeout(400);
  await rpage.screenshot({ path: `${OUT}/rm${i}.png` });
}

console.log(`console errors/warnings: ${consoleErrors.length}`);
consoleErrors.slice(0, 12).forEach((e) => console.log("  " + e));
console.log(`page errors: ${pageErrors.length}`);
pageErrors.slice(0, 12).forEach((e) => console.log("  " + e));

await browser.close();
