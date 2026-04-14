import { test, expect } from '@playwright/test';

test.describe('bento theming + responsive grid', () => {
  test('bento grid is 12 columns on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/test/bento');
    await page.waitForSelector('.bento-grid');

    const columns = await page.locator('.bento-grid').evaluate((el) =>
      getComputedStyle(el).gridTemplateColumns,
    );

    // 12 columns should produce 12 values
    const colCount = columns.split(' ').length;
    expect(colCount).toBe(12);
  });

  test('bento grid stacks to single column on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/test/bento');
    await page.waitForSelector('.bento-grid');

    const cards = page.locator('.bento-grid > *');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // All cards should be full-width (single column)
    for (let i = 0; i < count; i++) {
      const box = await cards.nth(i).boundingBox();
      expect(box).not.toBeNull();
      // Card should span nearly full viewport width (minus padding)
      expect(box!.width).toBeGreaterThan(300);
    }
  });

  test('cards have 1.5rem border-radius', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/test/bento');
    await page.waitForSelector('[data-card]');

    const radius = await page.locator('[data-card]').first().evaluate((el) =>
      getComputedStyle(el).borderRadius,
    );

    // 1.5rem = 24px at default 16px font size
    expect(radius).toBe('24px');
  });

  test('cards have 1.5rem gap between them', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/test/bento');
    await page.waitForSelector('.bento-grid');

    const gap = await page.locator('.bento-grid').evaluate((el) =>
      getComputedStyle(el).gap,
    );

    // 1.5rem = 24px at default 16px font size
    expect(gap).toBe('24px');
  });
});
