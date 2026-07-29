#!/usr/bin/env node
/**
 * Download Chromium for Brand DNA visual extraction on deploy hosts.
 * Skips on local/dev unless PLAYWRIGHT_INSTALL=1 is set.
 */
import { execSync } from 'node:child_process';

const shouldInstall =
  process.env.PLAYWRIGHT_INSTALL === '1' ||
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  Boolean(process.env.RAILWAY_ENVIRONMENT_NAME) ||
  process.env.CI === 'true';

if (!shouldInstall) {
  process.exit(0);
}

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1') {
  console.log('[playwright-postinstall] PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 — skipping');
  process.exit(0);
}

try {
  console.log('[playwright-postinstall] Installing Chromium…');
  // Prefer with-deps on Linux so shared libraries exist; fall back to browsers only.
  try {
    execSync('npx playwright install --with-deps chromium', {
      stdio: 'inherit',
      env: process.env,
    });
  } catch {
    execSync('npx playwright install chromium', {
      stdio: 'inherit',
      env: process.env,
    });
  }
  console.log('[playwright-postinstall] Chromium ready');
} catch (err) {
  console.warn(
    '[playwright-postinstall] Chromium install failed — Brand DNA will use HTML color/font fallback.',
    err?.message || err,
  );
  // Non-fatal: scrapeBrandSignals already falls back to HTML heuristics.
  process.exit(0);
}
