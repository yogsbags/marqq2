#!/usr/bin/env node
/**
 * Capture real Marqq app screenshots for marketing-site/public/screenshots/
 *
 * Prereqs:
 *   1. From repo root (marqq/): npm run dev   → app on http://127.0.0.1:3007
 *   2. Env (do not commit secrets):
 *        export MARQQ_SCREENSHOT_EMAIL="you@company.com"
 *        export MARQQ_SCREENSHOT_PASSWORD="your-password"
 *
 * Prefer Playwright (starts dev server automatically):
 *   npm run screenshots:marketing
 *
 * Or Node + manual dev server:
 *   node scripts/capture-marketing-screenshots.mjs
 *
 * Outputs (PNG, 1920×1000 viewport):
 *   marketing-site/public/screenshots/hero-dashboard.png
 *   marketing-site/public/screenshots/modules-rail.png   (Content Studio module)
 *   marketing-site/public/screenshots/ai-chat.png          (Ask AI drawer open)
 */

import { chromium } from 'playwright';
import { stat, readFileSync, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'marketing-site', 'public', 'screenshots');

const envScreenshots = path.join(ROOT, '.env.screenshots');
if (existsSync(envScreenshots)) {
  for (const line of readFileSync(envScreenshots, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const BASE_URL =
  process.env.MARQQ_SCREENSHOT_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  'http://127.0.0.1:3007';
const EMAIL = process.env.MARQQ_SCREENSHOT_EMAIL || '';
const PASSWORD = process.env.MARQQ_SCREENSHOT_PASSWORD || '';

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error(`
Missing credentials. Set before running:
  export MARQQ_SCREENSHOT_EMAIL="your@email"
  export MARQQ_SCREENSHOT_PASSWORD="your-password"

Optional:
  export MARQQ_SCREENSHOT_URL="${BASE_URL}"
`);
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  let ok = false;
  try {
    const r = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
    ok = r.ok;
  } catch {
    ok = false;
  }
  if (!ok) {
    console.error(`Cannot reach Marqq app at ${BASE_URL}\nStart it with: npm run dev`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.waitForSelector('[data-tour="header-ask-ai"]', { timeout: 120_000 });

  try {
    await page.evaluate(() => {
      localStorage.setItem('marqq_home_tour_done', '1');
      sessionStorage.removeItem('marqq_post_onboard_home_tour');
    });
  } catch {
    /* ignore */
  }

  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await delay(200);
  }

  await page.getByRole('button', { name: 'Home' }).click();
  await delay(800);
  await page.screenshot({
    path: path.join(OUT, 'hero-dashboard.png'),
    type: 'png',
  });
  console.log('Wrote hero-dashboard.png');

  const expandExecute = page.getByRole('button', { name: /Expand Execute section/i });
  if (await expandExecute.isVisible().catch(() => false)) {
    await expandExecute.click();
    await delay(400);
  }
  await page.getByRole('button', { name: 'Content Studio' }).click();
  await delay(1500);
  await page.screenshot({
    path: path.join(OUT, 'modules-rail.png'),
    type: 'png',
  });
  console.log('Wrote modules-rail.png');

  await page.getByRole('button', { name: 'Home' }).click();
  await delay(600);
  await page.getByRole('button', { name: 'Ask AI' }).click();
  await delay(1200);
  await page.screenshot({
    path: path.join(OUT, 'ai-chat.png'),
    type: 'png',
  });
  console.log('Wrote ai-chat.png');

  await browser.close();

  for (const f of ['hero-dashboard.png', 'modules-rail.png', 'ai-chat.png']) {
    const st = await stat(path.join(OUT, f));
    console.log(`  ${f}  ${Math.round(st.size / 1024)} KB`);
  }
  console.log('\nUpdate marketing-site index.html og:image URLs to .png if you use a CDN.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
