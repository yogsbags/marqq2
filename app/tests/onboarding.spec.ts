import { expect, test } from '@playwright/test';

test.describe('Onboarding Flow UI Test', () => {
  test('Should login and complete the onboarding flow correctly', async ({ page }) => {
    // 1. Navigate and login
    await page.goto('/');

    // Clear onboarded state to force onboarding screen
    await page.evaluate(() => localStorage.removeItem('torqq_onboarded'));

    // Check if the login form is present
    const emailLocator = page.locator('#email');
    const hasLogin = await emailLocator.count() > 0;

    if (hasLogin) {
      console.log('Login form detected. Proceeding with authentication.');
      await emailLocator.first().fill('yogsbags@gmail.com');
      await page.locator('#password').first().fill('Acc1234$&');

      // Wait for navigation and clear local storage right after navigating
      await Promise.all([
        page.waitForNavigation(),
        page.locator('button[type="submit"]:has-text("Sign In")').click()
      ]);
      await page.evaluate(() => localStorage.removeItem('torqq_onboarded'));
      console.log('Login submitted and navigated successfully.');
    }

    // Force clear again just in case, and reload to ensure the new state applies
    await page.evaluate(() => window.localStorage.removeItem('torqq_onboarded'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 2. Verify 'Welcome to Torqq AI' rendering smoothly
    await expect(page.locator('text=Welcome to Torqq AI')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Your AI team');

    // Take screenshot of the start
    await page.screenshot({ path: 'test-results/onboarding-start.png' });

    // 3. Start the form process
    await page.locator('button:has-text("Brief the team")').click();

    // -- STEP 1: Identity --
    await expect(page.locator('text=01 — Identity')).toBeVisible();
    await page.getByPlaceholder('e.g. PL Capital').fill('Playwright Test Co');
    await page.getByPlaceholder('e.g. WealthTech, India').fill('Automated QA Testing');
    await page.locator('button:has-text("Continue")').click();

    // -- STEP 2: Audience --
    await expect(page.locator('text=02 — Audience')).toBeVisible();
    await page.getByPlaceholder('e.g. HNI investors').fill('Automated bots and QAs');
    await page.locator('button:has-text("Continue")').click();

    // -- STEP 3: Landscape --
    await expect(page.locator('text=03 — Landscape')).toBeVisible();
    await page.getByPlaceholder('e.g. Groww').fill('Manual Testing Teams');
    await page.getByPlaceholder('e.g. SIP awareness').fill('Automate Everything');
    await page.locator('button:has-text("Continue")').click();

    // -- STEP 4: Goals --
    await expect(page.locator('text=04 — Goals')).toBeVisible();
    await page.getByPlaceholder('e.g. best mutual fund India').fill('playwright, e2e testing');
    await page.getByPlaceholder('e.g. Grow organic traffic').fill('Ship perfectly tested code 100x faster');

    // Take screenshot of the filled form
    await page.screenshot({ path: 'test-results/onboarding-form-filled.png' });

    // 4. Activate Team
    await page.locator('button:has-text("Activate Team")').click();

    // 5. Verify Activation screen
    await expect(page.locator('text=Briefing your agents...')).toBeVisible();

    // 6. Verify Done state
    await expect(page.locator('text=Team is operational.')).toBeVisible({ timeout: 15000 });

    console.log("Playwright UI interaction successfully executed without human intervention.");
  });
});
