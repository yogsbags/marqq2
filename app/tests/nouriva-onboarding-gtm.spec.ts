import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Full browser journey for Nouriva AI:
 * sign in → revised onboarding → goal-first GTM wizard → approve strategy drafts
 * → generate the final GTM strategy → save screenshots and a review report.
 *
 * Run with a fresh Nouriva test user:
 *   NOURIVA_EMAIL=... NOURIVA_PASSWORD=... npm run test:nouriva
 *
 * The account must be allowed to enter onboarding. Use a dedicated test account;
 * this test deliberately does not mutate production onboarding state.
 */

const email = process.env.NOURIVA_EMAIL || process.env.MARQQ_SCREENSHOT_EMAIL || '';
const password = process.env.NOURIVA_PASSWORD || process.env.MARQQ_SCREENSHOT_PASSWORD || '';
const outDir = path.resolve(process.env.NOURIVA_E2E_OUT || 'scripts/output/nouriva-onboarding-gtm');
const company = 'Nouriva AI';
const website = 'https://nouriva.tech';

type ReviewReport = {
  company: string;
  website: string;
  startedAt: string;
  completedAt?: string;
  screenshots: string[];
  onboarding: {
    stepsSeen: string[];
    recommendedAgents: string[];
    recommendedConnectors: string[];
  };
  wizard: {
    sectionsSeen: string[];
    strategyDraftsApproved: string[];
    northStarText: string;
    strategyText: string;
    reviewFlags: string[];
  };
};

function report(): ReviewReport {
  return {
    company,
    website,
    startedAt: new Date().toISOString(),
    screenshots: [],
    onboarding: { stepsSeen: [], recommendedAgents: [], recommendedConnectors: [] },
    wizard: { sectionsSeen: [], strategyDraftsApproved: [], northStarText: '', strategyText: '', reviewFlags: [] },
  };
}

async function snap(page: Page, name: string, result: ReviewReport) {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${String(result.screenshots.length + 1).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  result.screenshots.push(file);
}

function wizard(page: Page) {
  return page.locator('[data-tour="gtm-module-wizard"]');
}

async function firstVisible(locator: Locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function answerCurrentQuestion(page: Page) {
  const root = wizard(page);
  const suggested = await firstVisible(root.getByRole('button').filter({ hasText: 'Suggested' }));
  if (suggested) {
    await suggested.click();
    return;
  }

  const optionButtons = root.locator('button').filter({ hasNotText: /Add module|Unlock last|Generate|Continue|Use|Back|Home/ });
  const option = await firstVisible(optionButtons);
  if (!option) throw new Error('Could not find an answer option for the current GTM question');
  await option.click();
}

async function answerSection(page: Page, sectionName: string, result: ReviewReport) {
  const root = wizard(page);
  await expect(root).toContainText(sectionName, { timeout: 120_000 });
  result.wizard.sectionsSeen.push(sectionName);

  for (let i = 0; i < 12; i += 1) {
    const question = root.locator('text=/Q\\d+\\//').first();
    if (await question.isVisible().catch(() => false)) {
      await answerCurrentQuestion(page);
      continue;
    }
    break;
  }

  const cta = await firstVisible(root.getByRole('button').filter({ hasText: /Generate|Continue/ }));
  if (!cta) throw new Error(`No completion CTA found for GTM section ${sectionName}`);
  await cta.click();

  // Module has no generated draft. Other sections open one or more review overlays.
  for (let i = 0; i < 6; i += 1) {
    const looksGood = page.getByRole('button', { name: /Looks Good/i }).last();
    if (!(await looksGood.isVisible().catch(() => false))) break;

    const draftText = await page.locator('body').innerText().catch(() => '');
    if (sectionName.toLowerCase().includes('goal') && !result.wizard.northStarText) {
      result.wizard.northStarText = draftText.slice(0, 6000);
    }
    await looksGood.click();
    result.wizard.strategyDraftsApproved.push(`${sectionName} draft ${i + 1}`);
    await page.waitForTimeout(600);
  }
}

test('Nouriva onboarding and GTM strategy journey', async ({ page }) => {
  test.skip(!email || !password, 'Set NOURIVA_EMAIL and NOURIVA_PASSWORD for the dedicated Nouriva test account');
  test.setTimeout(18 * 60 * 1000);

  const result = report();
  page.on('pageerror', (error) => result.wizard.reviewFlags.push(`pageerror: ${error.message}`));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /Sign In/i }).click();

  await page.waitForTimeout(1_000);
  await snap(page, '01-after-sign-in', result);

  const briefButton = page.getByRole('button', { name: /Brief the team/i });
  if (!(await briefButton.isVisible().catch(() => false))) {
    throw new Error('Test account is already onboarded. Use a dedicated fresh Nouriva test account.');
  }
  await briefButton.click();

  await expect(page.getByText('Your Company')).toBeVisible();
  result.onboarding.stepsSeen.push('Your Company');
  await page.getByLabel('Company Name').fill(company);
  await page.getByLabel('Website URL').fill(website);
  await snap(page, '02-company', result);
  await page.getByRole('button', { name: /Continue/i }).click();

  await expect(page.getByText('Your Market')).toBeVisible();
  result.onboarding.stepsSeen.push('Your Market');
  await page.getByLabel('Industry / Niche').fill('Consumer health technology and AI nutrition');
  await page.getByLabel('Ideal Customer Profile').fill('Health-conscious adults with recent lab reports who want practical personalized nutrition guidance');
  await snap(page, '03-market', result);
  await page.getByRole('button', { name: /Continue/i }).click();

  await expect(page.getByText('Set the outcome')).toBeVisible();
  result.onboarding.stepsSeen.push('Set the outcome');
  await page.getByLabel('Business outcome').fill('Acquire and activate paid users from the lab-upload funnel');
  await page.getByRole('button', { name: 'Next 90 days' }).click();
  await page.getByLabel('Target, if known').fill('500 activated paid users');
  await page.getByLabel('Current baseline, if known').fill('0 confirmed baseline; establish it in week one');
  await snap(page, '04-outcome', result);
  await page.getByRole('button', { name: /Continue/i }).click();

  await expect(page.getByText('Connect Accounts')).toBeVisible();
  result.onboarding.stepsSeen.push('Connect Accounts');
  const connectors = page.locator('button').filter({ hasText: 'Recommended' });
  result.onboarding.recommendedConnectors = await connectors.allInnerTexts();
  await snap(page, '05-connectors', result);
  await page.getByRole('button', { name: /Skip for now/i }).click();

  await expect(page.getByText('Review your Brand DNA')).toBeVisible({ timeout: 180_000 });
  await snap(page, '06-brand-dna-and-brief', result);
  const agentCards = page.locator('text=/Veena|Isha|Neel|Tara|Sam|Kiran|Zara|Maya|Riya|Arjun|Dev|Priya/');
  result.onboarding.recommendedAgents = [...new Set((await agentCards.allInnerTexts()).filter(Boolean))];
  await page.getByRole('button', { name: /Looks Good/i }).click();

  await expect(page.getByText('Ready for GTM')).toBeVisible({ timeout: 120_000 });
  await snap(page, '07-ready-for-gtm', result);

  await expect(wizard(page)).toBeVisible({ timeout: 180_000 });
  await expect(wizard(page).locator('[data-tour="gtm-section-progress"]')).toContainText(/1\. Goals/i, { timeout: 180_000 });
  await answerSection(page, 'Goals', result);
  await answerSection(page, 'Module', result);
  await answerSection(page, 'Offer', result);
  await answerSection(page, 'Audience', result);
  await snap(page, '08-approved-strategy-sections', result);

  const generate = wizard(page).getByText(/Generate GTM strategy document/i).first();
  await expect(generate).toBeVisible({ timeout: 120_000 });
  await generate.click();
  await expect(wizard(page)).toContainText(/North-star target|North Star Metric|Executive Summary/i, { timeout: 240_000 });
  await snap(page, '09-final-gtm-strategy', result);

  result.wizard.strategyText = await page.locator('[data-tour="gtm-module-wizard"]').innerText();
  if (!/Nouriva|nutrition|lab|biomarker|paid users|activated/i.test(result.wizard.strategyText)) {
    result.wizard.reviewFlags.push('Final strategy is not sufficiently grounded in Nouriva context.');
  }
  if (!/north.?star|500|activated paid users|quantified/i.test(`${result.wizard.northStarText}\n${result.wizard.strategyText}`)) {
    result.wizard.reviewFlags.push('North Star or quantified target is missing from the reviewed output.');
  }
  if (/final answer.{0,80}final answer.{0,80}final answer/i.test(result.wizard.strategyText)) {
    result.wizard.reviewFlags.push('Strategy contains repeated boilerplate phrasing.');
  }

  result.completedAt = new Date().toISOString();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'review-report.json'), JSON.stringify(result, null, 2));
  expect(result.wizard.reviewFlags, result.wizard.reviewFlags.join('\n')).toEqual([]);
});
