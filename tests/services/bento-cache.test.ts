import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql, eq, and } from 'drizzle-orm';
import postgres from 'postgres';
import Redis from 'ioredis';
import * as schema from '../../src/lib/schema';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getBentoData } from '../../src/lib/services/bento-cache';
import { cacheGet, cacheDelete } from '../../src/lib/redis';
import type { LayoutCard } from '../../src/lib/layout-engine';

const fixturesDir = join(__dirname, '..', 'fixtures');
const sampleExtracted = JSON.parse(readFileSync(join(fixturesDir, 'sample-extracted.json'), 'utf-8'));
const sampleLayout: LayoutCard[] = JSON.parse(readFileSync(join(fixturesDir, 'sample-layout.json'), 'utf-8'));

let queryClient: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let redis: Redis;

const CACHE_KEY = 'bento:data:anthropic:claude-sonnet-4';

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
  await db.execute(sql`DELETE FROM models WHERE provider = 'anthropic' AND name = 'claude-sonnet-4'`);
  await db.execute(sql`DELETE FROM users WHERE github_id = 99975`);
  await redis.del(CACHE_KEY);
});

afterAll(async () => {
  await queryClient.end();
  await redis.quit();
});

async function seedModel() {
  const [user] = await db.execute(sql`
    INSERT INTO users (github_id, username, avatar_url)
    VALUES (99975, 'test-cache', 'https://example.com/avatar.png')
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

  return model.id as string;
}

describe('bento data caching', () => {
  it('first load populates Redis cache', async () => {
    await seedModel();

    // Cache should be empty
    const before = await cacheGet(redis, CACHE_KEY);
    expect(before).toBeNull();

    // Fetch via cache service
    const data = await getBentoData('anthropic', 'claude-sonnet-4', { db, redis });
    expect(data).not.toBeNull();
    expect(data!.extracted.provider).toBe('anthropic');

    // Cache should now be populated
    const after = await cacheGet(redis, CACHE_KEY);
    expect(after).not.toBeNull();
  });

  it('second load serves from cache, not DB', async () => {
    await seedModel();

    // First load populates cache
    await getBentoData('anthropic', 'claude-sonnet-4', { db, redis });

    // Delete DB row but leave cache
    await db.execute(sql`DELETE FROM models WHERE provider = 'anthropic' AND name = 'claude-sonnet-4'`);

    // Should still return data from cache
    const data = await getBentoData('anthropic', 'claude-sonnet-4', { db, redis });
    expect(data).not.toBeNull();
    expect(data!.extracted.provider).toBe('anthropic');
  });

  it('cache key can be deleted to force DB refetch', async () => {
    await seedModel();

    // Populate cache
    await getBentoData('anthropic', 'claude-sonnet-4', { db, redis });

    // Delete cache key
    await cacheDelete(redis, CACHE_KEY);

    // Verify cache is empty
    const cached = await cacheGet(redis, CACHE_KEY);
    expect(cached).toBeNull();
  });
});
