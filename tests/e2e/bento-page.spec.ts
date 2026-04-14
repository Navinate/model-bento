import { test, expect } from '@playwright/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../src/lib/schema';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

  // Seed test data
  await db.execute(sql`DELETE FROM models WHERE provider = 'anthropic' AND name = 'claude-sonnet-4'`);
  await db.execute(sql`DELETE FROM users WHERE github_id = 99980`);

  const [user] = await db.execute(sql`
    INSERT INTO users (github_id, username, avatar_url)
    VALUES (99980, 'test-ssr', 'https://example.com/avatar.png')
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
  await db.execute(sql`DELETE FROM users WHERE github_id = 99980`);
  await queryClient.end();
});

test.describe('SSR bento page', () => {
  test('published model page returns 200', async ({ page }) => {
    const response = await page.goto('/m/anthropic/claude-sonnet-4');
    expect(response?.status()).toBe(200);
  });

  test('page renders the model display name', async ({ page }) => {
    await page.goto('/m/anthropic/claude-sonnet-4');
    await expect(page.locator('text=Claude Sonnet 4')).toBeVisible();
  });

  test('nonexistent model returns 404', async ({ page }) => {
    const response = await page.goto('/m/fake/nonexistent-model');
    expect(response?.status()).toBe(404);
  });

  test('page has Cache-Control header for immutable content', async ({ page }) => {
    const response = await page.goto('/m/anthropic/claude-sonnet-4');
    const cacheControl = response?.headers()['cache-control'];
    expect(cacheControl).toBeDefined();
    expect(cacheControl).toContain('max-age');
  });
});
