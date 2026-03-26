/**
 * Capture PNGs for marketing-site (run from marqq repo root).
 *
 *   npm run screenshots:marketing
 *
 * Requires MARQQ_SCREENSHOT_EMAIL and MARQQ_SCREENSHOT_PASSWORD
 * (export or put in marqq/.env.screenshots — see .env.screenshots.example).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(REPO_ROOT, 'marketing-site', 'public', 'screenshots');

const email = process.env.MARQQ_SCREENSHOT_EMAIL ?? '';
const password = process.env.MARQQ_SCREENSHOT_PASSWORD ?? '';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('hero-dashboard, modules-rail, ai-chat PNGs', async ({ page }) => {
  test.skip(
    !email || !password,
    'Set MARQQ_SCREENSHOT_EMAIL and MARQQ_SCREENSHOT_PASSWORD (or create .env.screenshots from .env.screenshots.example)',
  );

  fs.mkdirSync(OUT, { recursive: true });

  await page.setViewportSize({ width: 1920, height: 1000 });

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.locator('[data-tour="header-ask-ai"]')).toBeVisible({ timeout: 120_000 });

  await page.evaluate(() => {
    localStorage.setItem('marqq_home_tour_done', '1');
    sessionStorage.removeItem('marqq_post_onboard_home_tour');
  });

  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await delay(200);
  }

  await page.getByRole('button', { name: 'Home' }).click();
  await delay(800);
  await page.screenshot({ path: path.join(OUT, 'hero-dashboard.png'), type: 'png' });

  const expandExecute = page.getByRole('button', { name: /Expand Execute section/i });
  if (await expandExecute.isVisible().catch(() => false)) {
    await expandExecute.click();
    await delay(400);
  }
  await page.getByRole('button', { name: 'Content Studio' }).click();
  await delay(1500);
  await page.screenshot({ path: path.join(OUT, 'modules-rail.png'), type: 'png' });

  await page.getByRole('button', { name: 'Home' }).click();
  await delay(600);
  await page.getByRole('button', { name: 'Ask AI' }).click();
  await delay(1200);
  await page.screenshot({ path: path.join(OUT, 'ai-chat.png'), type: 'png' });

  for (const f of ['hero-dashboard.png', 'modules-rail.png', 'ai-chat.png']) {
    const stat = fs.statSync(path.join(OUT, f));
    expect(stat.size).toBeGreaterThan(5_000);
  }
});
