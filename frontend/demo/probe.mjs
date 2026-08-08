/**
 * Dumps the real DOM before a single selector is written.
 *
 * Every take I have lost went the same way: a selector that looked right,
 * an element that turned out to have no `type` attribute, and three minutes of
 * recording against a page that never advanced. Two seconds here, or a whole
 * take later.
 *
 *   node demo/probe.mjs /dashboard?tab=disputes
 */
import { chromium } from "playwright";

const APP = process.env.DEMO_URL ?? "http://localhost:3000";
const path = process.argv[2] ?? "/dashboard?tab=disputes";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(APP + path, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const found = await page.evaluate(() =>
  [...document.querySelectorAll("button,a,input,select,textarea,[role=button]")]
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") ?? "",
      id: el.id || "",
      cls: (el.className || "").toString().split(/\s+/).slice(0, 3).join("."),
      text: (el.innerText || el.placeholder || el.value || "").trim().slice(0, 44),
      href: el.getAttribute("href") ?? "",
    })));

console.log(`\n${APP}${path}  —  ${found.length} interactive elements\n`);
for (const f of found) {
  console.log(`  ${f.tag.padEnd(8)} ${(f.type || "-").padEnd(9)} ` +
              `${(f.id ? "#" + f.id : "-").padEnd(22)} ${f.text || f.href}`);
}
await browser.close();
