import { test, expect } from '@playwright/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../src/lib/schema';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures');
const sampleExtracted = JSON.parse(readFileSync(join(fixturesDir, 'sample-extracted.json'), 'utf-8'));
const sampleLayout = JSON.parse(readFileSync(join(fixturesDir, 'sample-layout.json'), 'utf-8'));

let queryClient: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

test.beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');
  queryClient = postgres(databaseUrl);
  db = drizzle(queryClient, { schema });

  await db.execute(sql`DELETE FROM models WHERE provider = 'anthropic' AND name = 'claude-sonnet-4'`);
  await db.execute(sql`DELETE FROM users WHERE github_id = 99995`);

  const [user] = await db.execute(sql`
    INSERT INTO users (github_id, username, avatar_url)
    VALUES (99995, 'test-embed', 'https://example.com/avatar.png')
    RETURNING id
  `);

  const [model] = await db.execute(sql`
    INSERT INTO models (provider, name, display_name, created_by)
    VALUES ('anthropic', 'claude-sonnet-4', 'Claude Sonnet 4', ${user.id})
    RETURNING id
  `);

  await db.execute(sql`
    INSERT INTO bento_pages (model_id, layout, extracted, source_type)
    VALUES (${model.id}, ${JSON.stringify(sampleLayout)}::jsonb, ${JSON.stringify(sampleExtracted)}::jsonb, 'text')
  `);
});

test.afterAll(async () => {
  await db.execute(sql`DELETE FROM models WHERE provider = 'anthropic' AND name = 'claude-sonnet-4'`);
  await db.execute(sql`DELETE FROM users WHERE github_id = 99995`);
  await queryClient.end();
});

test.describe('embed view', () => {
  test('embed page renders without nav or footer', async ({ page }) => {
    await page.goto('/m/anthropic/claude-sonnet-4/embed');
    const nav = await page.locator('nav').count();
    const footer = await page.locator('footer').count();
    expect(nav).toBe(0);
    expect(footer).toBe(0);
  });

  test('embed page has View on Model Bento link', async ({ page }) => {
    await page.goto('/m/anthropic/claude-sonnet-4/embed');
    const link = page.locator('a[href="/m/anthropic/claude-sonnet-4"]');
    await expect(link).toBeVisible();
  });

  test('embed page shows compact layout with fewer cards than full page', async ({ page }) => {
    await page.goto('/m/anthropic/claude-sonnet-4/embed');
    await page.waitForSelector('[data-card]');
    const embedCardCount = await page.locator('[data-card]').count();

    await page.goto('/m/anthropic/claude-sonnet-4');
    await page.waitForSelector('[data-card]');
    const fullCardCount = await page.locator('[data-card]').count();

    expect(embedCardCount).toBeLessThan(fullCardCount);
  });

  test('embed response does not have restrictive X-Frame-Options', async ({ page }) => {
    const response = await page.goto('/m/anthropic/claude-sonnet-4/embed');
    const xfo = response?.headers()['x-frame-options'];
    // Should not have DENY or SAMEORIGIN
    expect(xfo).not.toBe('DENY');
    expect(xfo).not.toBe('SAMEORIGIN');
  });
});
