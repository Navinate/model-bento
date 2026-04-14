import { test, expect } from '@playwright/test';

test.describe('bento animations', () => {
  test('cards are not visible before scrolling into view', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/test/bento');
    // Wait for React hydration
    await page.waitForSelector('[data-card]');
    // Small wait for the useEffect to set initial opacity
    await page.waitForTimeout(200);

    // All cards should be below the fold (behind 100vh spacer) and opacity 0
    const cards = page.locator('[data-card]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const opacity = await cards.nth(i).evaluate((el) =>
        getComputedStyle(el).opacity,
      );
      expect(opacity).toBe('0');
    }
  });

  test('cards animate in when scrolled into view', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/test/bento');
    await page.waitForSelector('[data-card]');
    await page.waitForTimeout(200);

    // Scroll past the spacer to the bento grid
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Wait for stagger + animation to complete
    await page.waitForTimeout(2000);

    // All cards should now be visible
    const cards = page.locator('[data-card]');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const opacity = await cards.nth(i).evaluate((el) =>
        getComputedStyle(el).opacity,
      );
      expect(Number(opacity)).toBeGreaterThan(0.9);
    }
  });
});
