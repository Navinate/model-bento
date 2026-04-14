import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql, and } from 'drizzle-orm';
import postgres from 'postgres';
import Redis from 'ioredis';
import * as schema from '../../src/lib/schema';
import { readFileSync } from 'fs';
import { join } from 'path';
import { publishModel } from '../../src/lib/services/publish';
import { cacheSet, cacheGet } from '../../src/lib/redis';
import type { ExtractedModel } from '../../src/lib/services/llm-extractor';
import type { LayoutCard } from '../../src/lib/layout-engine';

const fixturesDir = join(__dirname, '..', 'fixtures');
const sampleExtracted: ExtractedModel = JSON.parse(
  readFileSync(join(fixturesDir, 'sample-extracted.json'), 'utf-8'),
);
const sampleLayout: LayoutCard[] = JSON.parse(
  readFileSync(join(fixturesDir, 'sample-layout.json'), 'utf-8'),
);

let queryClient: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let redis: Redis;

const TEST_USER_GH_ID = 99970;

beforeAll(() => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');
  queryClient = postgres(databaseUrl);
  db = drizzle(queryClient, { schema });

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('REDIS_URL not set');
  redis = new Redis(redisUrl);
});

afterEach(async () => {
  // Clean up test data
  await db.execute(sql`DELETE FROM models WHERE provider = 'anthropic' AND name = 'claude-sonnet-4'`);
  await db.execute(sql`DELETE FROM users WHERE github_id = ${TEST_USER_GH_ID}`);
  const keys = await redis.keys('test:*');
  if (keys.length > 0) await redis.del(...keys);
  await redis.del('explore:models');
});

afterAll(async () => {
  await queryClient.end();
  await redis.quit();
});

async function seedUser() {
  const [user] = await db.execute(sql`
    INSERT INTO users (github_id, username, avatar_url)
    VALUES (${TEST_USER_GH_ID}, 'test-publish', 'https://example.com/avatar.png')
    RETURNING id
  `);
  return user.id as string;
}

describe('publish service', () => {
  it('publish creates model, bento_page, and source_text in one transaction', async () => {
    const userId = await seedUser();

    await publishModel({
      extracted: sampleExtracted,
      layout: sampleLayout,
      sourceText: 'raw model card text',
      sourceType: 'text',
      userId,
    }, { db, redis });

    // Verify all 3 tables have rows
    const [model] = await db
      .select()
      .from(schema.models)
      .where(and(eq(schema.models.provider, 'anthropic'), eq(schema.models.name, 'claude-sonnet-4')));

    expect(model).toBeDefined();
    expect(model.displayName).toBe('Claude Sonnet 4');
    expect(model.createdBy).toBe(userId);

    const [bentoPage] = await db
      .select()
      .from(schema.bentoPages)
      .where(eq(schema.bentoPages.modelId, model.id));

    expect(bentoPage).toBeDefined();
    expect(bentoPage.sourceType).toBe('text');

    const [sourceText] = await db
      .select()
      .from(schema.sourceTexts)
      .where(eq(schema.sourceTexts.modelId, model.id));

    expect(sourceText).toBeDefined();
    expect(sourceText.content).toBe('raw model card text');
  });

  it('publish fails atomically if model already exists', async () => {
    const userId = await seedUser();

    // First publish
    await publishModel({
      extracted: sampleExtracted,
      layout: sampleLayout,
      sourceText: 'first',
      sourceType: 'text',
      userId,
    }, { db, redis });

    // Count before second attempt
    const countBefore = await db
      .select()
      .from(schema.bentoPages);

    // Second publish with same provider+name should fail
    await expect(publishModel({
      extracted: sampleExtracted,
      layout: sampleLayout,
      sourceText: 'second',
      sourceType: 'text',
      userId,
    }, { db, redis })).rejects.toThrow();

    // Count after should be same (transaction rolled back)
    const countAfter = await db
      .select()
      .from(schema.bentoPages);

    expect(countAfter.length).toBe(countBefore.length);
  });

  it('publish invalidates explore cache', async () => {
    const userId = await seedUser();

    // Seed explore cache
    await cacheSet(redis, 'explore:models', [{ name: 'old-model' }]);

    await publishModel({
      extracted: sampleExtracted,
      layout: sampleLayout,
      sourceText: 'text',
      sourceType: 'text',
      userId,
    }, { db, redis });

    // Cache should be invalidated
    const cached = await cacheGet(redis, 'explore:models');
    expect(cached).toBeNull();
  });

  it('published bento_page has correct layout and extracted JSONB', async () => {
    const userId = await seedUser();

    await publishModel({
      extracted: sampleExtracted,
      layout: sampleLayout,
      sourceText: 'text',
      sourceType: 'text',
      userId,
    }, { db, redis });

    const [model] = await db
      .select()
      .from(schema.models)
      .where(and(eq(schema.models.provider, 'anthropic'), eq(schema.models.name, 'claude-sonnet-4')));

    const [bentoPage] = await db
      .select()
      .from(schema.bentoPages)
      .where(eq(schema.bentoPages.modelId, model.id));

    expect(bentoPage.extracted).toEqual(sampleExtracted);
    expect(bentoPage.layout).toEqual(sampleLayout);
  });
});
