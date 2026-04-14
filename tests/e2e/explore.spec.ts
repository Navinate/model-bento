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

const testModels = [
  { provider: 'anthropic', name: 'claude-sonnet-4', displayName: 'Claude Sonnet 4' },
  { provider: 'openai', name: 'gpt-4o', displayName: 'GPT-4o' },
  { provider: 'meta', name: 'llama-3', displayName: 'Llama 3' },
];

test.beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');
  queryClient = postgres(databaseUrl);
  db = drizzle(queryClient, { schema });

  // Clean up
  for (const m of testModels) {
    await db.execute(sql`DELETE FROM models WHERE provider = ${m.provider} AND name = ${m.name}`);
  }
  await db.execute(sql`DELETE FROM users WHERE github_id = 99985`);

  // Seed user
  const [user] = await db.execute(sql`
    INSERT INTO users (github_id, username, avatar_url)
    VALUES (99985, 'test-explore', 'https://example.com/avatar.png')
    RETURNING id
  `);

  // Seed 3 models with bento pages
  for (const m of testModels) {
    const extracted = { ...sampleExtracted, provider: m.provider, name: m.name, display_name: m.displayName };
    const [model] = await db.execute(sql`
      INSERT INTO models (provider, name, display_name, created_by)
      VALUES (${m.provider}, ${m.name}, ${m.displayName}, ${user.id})
      RETURNING id
    `);

    await db.execute(sql`
      INSERT INTO bento_pages (model_id, layout, extracted, source_type)
      VALUES (${model.id}, ${JSON.stringify(sampleLayout)}::jsonb, ${JSON.stringify(extracted)}::jsonb, 'text')
    `);
  }
});

test.afterAll(async () => {
  for (const m of testModels) {
    await db.execute(sql`DELETE FROM models WHERE provider = ${m.provider} AND name = ${m.name}`);
  }
  await db.execute(sql`DELETE FROM users WHERE github_id = 99985`);
  await queryClient.end();
});

test.describe('explore page', () => {
  test('explore page lists all published models', async ({ page }) => {
    await page.goto('/explore');
    for (const m of testModels) {
      await expect(page.locator(`text=${m.displayName}`)).toBeVisible();
    }
  });

  test('explore page shows empty state when no models match', async ({ page }) => {
    await page.goto('/explore?q=zzz-nonexistent-query-zzz');
    await expect(page.locator('[data-empty-state]')).toBeVisible();
  });

  test('search filters models by name', async ({ page }) => {
    await page.goto('/explore');
    // Wait for React hydration
    await page.waitForSelector('[data-search-input]');
    await page.waitForTimeout(500);
    // Type to trigger React onChange
    await page.locator('[data-search-input]').click();
    await page.locator('[data-search-input]').fill('');
    await page.locator('[data-search-input]').type('claude', { delay: 50 });
    await page.waitForTimeout(500);
    // Use role-based locators to avoid matching serialized props
    await expect(page.getByRole('link', { name: /Claude Sonnet 4/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /GPT-4o/i })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /Llama 3/i })).not.toBeVisible();
  });
});
