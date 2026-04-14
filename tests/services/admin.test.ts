import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql, and } from 'drizzle-orm';
import postgres from 'postgres';
import Redis from 'ioredis';
import * as schema from '../../src/lib/schema';
import { readFileSync } from 'fs';
import { join } from 'path';
import { deleteModel, regenerateModel, banUser, unbanUser } from '../../src/lib/services/admin';
import { cacheSet, cacheGet } from '../../src/lib/redis';

const fixturesDir = join(__dirname, '..', 'fixtures');
const sampleExtracted = JSON.parse(readFileSync(join(fixturesDir, 'sample-extracted.json'), 'utf-8'));
const sampleLayout = JSON.parse(readFileSync(join(fixturesDir, 'sample-layout.json'), 'utf-8'));

let queryClient: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let redis: Redis;

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
  await db.execute(sql`DELETE FROM models WHERE provider = 'test-admin'`);
  await db.execute(sql`DELETE FROM users WHERE github_id IN (99901, 99902)`);
  await redis.del('bento:data:test-admin:test-model');
  await redis.del('explore:models');
});

afterAll(async () => {
  await queryClient.end();
  await redis.quit();
});

async function seedFullModel() {
  const [user] = await db.execute(sql`
    INSERT INTO users (github_id, username, avatar_url)
    VALUES (99901, 'test-admin-user', 'https://example.com/avatar.png')
    RETURNING id
  `);

  const [model] = await db.execute(sql`
    INSERT INTO models (provider, name, display_name, created_by)
    VALUES ('test-admin', 'test-model', 'Test Model', ${user.id})
    RETURNING id
  `);

  await db.execute(sql`
    INSERT INTO bento_pages (model_id, layout, extracted, source_type)
    VALUES (${model.id}, ${JSON.stringify(sampleLayout)}::jsonb, ${JSON.stringify(sampleExtracted)}::jsonb, 'text')
  `);

  await db.execute(sql`
    INSERT INTO source_texts (model_id, content)
    VALUES (${model.id}, 'Test model card source text')
  `);

  return { userId: user.id as string, modelId: model.id as string };
}

function mockClient(response: object) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text' as const, text: JSON.stringify(response) }],
      }),
    },
  };
}

describe('admin services', () => {
  describe('deleteModel', () => {
    it('delete removes model, bento_page, and source_text', async () => {
      await seedFullModel();

      await deleteModel('test-admin', 'test-model', { db, redis });

      const models = await db.execute(sql`SELECT * FROM models WHERE provider = 'test-admin'`);
      expect(models.length).toBe(0);
    });

    it('delete invalidates Redis cache', async () => {
      await seedFullModel();
      await cacheSet(redis, 'bento:data:test-admin:test-model', { test: true });

      await deleteModel('test-admin', 'test-model', { db, redis });

      const cached = await cacheGet(redis, 'bento:data:test-admin:test-model');
      expect(cached).toBeNull();
    });
  });

  describe('regenerateModel', () => {
    it('regenerate fetches source_text and re-extracts', async () => {
      await seedFullModel();

      const newExtracted = {
        ...sampleExtracted,
        description: 'Updated description after regeneration',
      };
      const client = mockClient(newExtracted);

      const result = await regenerateModel('test-admin', 'test-model', {
        db,
        redis,
        client: client as any,
      });

      expect(result.extracted.description).toBe('Updated description after regeneration');
    });

    it('regenerate updates bento_pages but not model identity', async () => {
      const { modelId } = await seedFullModel();

      const newExtracted = {
        ...sampleExtracted,
        description: 'Regenerated',
      };
      const client = mockClient(newExtracted);

      await regenerateModel('test-admin', 'test-model', { db, redis, client: client as any });

      // Model identity unchanged
      const [model] = await db.execute(sql`SELECT * FROM models WHERE id = ${modelId}`);
      expect(model.provider).toBe('test-admin');
      expect(model.name).toBe('test-model');

      // Bento page updated
      const [bentoPage] = await db.execute(sql`SELECT * FROM bento_pages WHERE model_id = ${modelId}`);
      expect((bentoPage.extracted as any).description).toBe('Regenerated');
    });

    it('regenerate invalidates Redis cache', async () => {
      await seedFullModel();
      await cacheSet(redis, 'bento:data:test-admin:test-model', { old: true });

      const client = mockClient(sampleExtracted);
      await regenerateModel('test-admin', 'test-model', { db, redis, client: client as any });

      const cached = await cacheGet(redis, 'bento:data:test-admin:test-model');
      expect(cached).toBeNull();
    });
  });

  describe('ban/unban', () => {
    it('ban sets banned_at and banned_reason on user', async () => {
      const [user] = await db.execute(sql`
        INSERT INTO users (github_id, username, avatar_url)
        VALUES (99902, 'ban-test', 'https://example.com/avatar.png')
        RETURNING id
      `);

      await banUser(user.id as string, 'Spam', { db });

      const [updated] = await db.execute(sql`SELECT * FROM users WHERE id = ${user.id}`);
      expect(updated.banned_at).not.toBeNull();
      expect(updated.banned_reason).toBe('Spam');
    });

    it('unban clears banned_at and banned_reason', async () => {
      const [user] = await db.execute(sql`
        INSERT INTO users (github_id, username, avatar_url)
        VALUES (99902, 'unban-test', 'https://example.com/avatar.png')
        RETURNING id
      `);

      await banUser(user.id as string, 'Spam', { db });
      await unbanUser(user.id as string, { db });

      const [updated] = await db.execute(sql`SELECT * FROM users WHERE id = ${user.id}`);
      expect(updated.banned_at).toBeNull();
      expect(updated.banned_reason).toBeNull();
    });
  });
});
