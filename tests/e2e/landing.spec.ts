import { test, expect } from '@playwright/test';

test.describe('landing page', () => {
  test('landing page renders hero section', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('[data-cta]')).toBeVisible();
  });

  test('search from landing page navigates to /explore with query', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-hero-search]').fill('claude');
    await page.locator('[data-hero-search]').press('Enter');
    await page.waitForURL(/\/explore\?q=claude/);
    expect(page.url()).toContain('/explore?q=claude');
  });
});
