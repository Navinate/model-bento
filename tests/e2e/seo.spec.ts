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
  await db.execute(sql`DELETE FROM users WHERE github_id = 99990`);

  const [user] = await db.execute(sql`
    INSERT INTO users (github_id, username, avatar_url)
    VALUES (99990, 'test-seo', 'https://example.com/avatar.png')
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
  await db.execute(sql`DELETE FROM users WHERE github_id = 99990`);
  await queryClient.end();
});

test.describe('SEO meta tags', () => {
  test('bento page has og:title matching display name', async ({ page }) => {
    await page.goto('/m/anthropic/claude-sonnet-4');
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toContain('Claude Sonnet 4');
  });

  test('bento page has og:description', async ({ page }) => {
    await page.goto('/m/anthropic/claude-sonnet-4');
    const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
    expect(ogDesc).toBeTruthy();
    expect(ogDesc!.length).toBeGreaterThan(0);
  });

  test('bento page has og:image', async ({ page }) => {
    await page.goto('/m/anthropic/claude-sonnet-4');
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toBeTruthy();
  });

  test('bento page has twitter:card=summary_large_image', async ({ page }) => {
    await page.goto('/m/anthropic/claude-sonnet-4');
    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    expect(twitterCard).toBe('summary_large_image');
  });

  test('bento page has canonical URL', async ({ page }) => {
    await page.goto('/m/anthropic/claude-sonnet-4');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain('/m/anthropic/claude-sonnet-4');
  });

  test('bento page has valid JSON-LD script tag', async ({ page }) => {
    await page.goto('/m/anthropic/claude-sonnet-4');
    const jsonLdText = await page.locator('script[type="application/ld+json"]').textContent();
    expect(jsonLdText).toBeTruthy();
    const jsonLd = JSON.parse(jsonLdText!);
    expect(jsonLd['@type']).toBe('SoftwareApplication');
  });

  test('JSON-LD contains model name and provider', async ({ page }) => {
    await page.goto('/m/anthropic/claude-sonnet-4');
    const jsonLdText = await page.locator('script[type="application/ld+json"]').textContent();
    const jsonLd = JSON.parse(jsonLdText!);
    expect(jsonLd.name).toBe('Claude Sonnet 4');
    expect(jsonLd.author.name).toBe('anthropic');
  });
});

test.describe('sitemap', () => {
  test('sitemap contains published model URLs', async ({ page }) => {
    const response = await page.goto('/sitemap.xml');
    const text = await response!.text();
    expect(text).toContain('<?xml');
    expect(text).toContain('/m/anthropic/claude-sonnet-4');
  });
});
