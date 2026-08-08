/** Screenshots for the deck. Real pages, real data, no mock-ups. */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const APP = process.env.DEMO_URL ?? "http://localhost:3000";
const OUT = "../deck/shots";
const PAGES = [
  ["dashboard", "/dashboard?tab=disputes"],
  ["console", "/console"],
  ["integration", "/dashboard?tab=integration"],
  ["storefront", "/store"],
  ["analytics", "/dashboard?tab=analytics"],
  ["widget", "/widget?store=st_rehana&order=ORD-2044"],
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [name, path] of PAGES) {
  const page = await browser.newPage({
    viewport: { width: name === "widget" ? 470 : 1400, height: 880 },
    deviceScaleFactor: 2,
  });
  await page.goto(APP + path, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ${name}.png`);
  await page.close();
}
await browser.close();
