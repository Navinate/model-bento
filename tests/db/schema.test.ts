import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../src/lib/schema';

let queryClient: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');
  queryClient = postgres(databaseUrl);
  db = drizzle(queryClient, { schema });
});

afterAll(async () => {
  await queryClient.end();
});

describe('database connection', () => {
  it('can connect to database and run a query', async () => {
    const result = await db.execute(sql`SELECT 1 as one`);
    expect(result).toBeDefined();
    expect(result[0].one).toBe(1);
  });
});

describe('database schema', () => {
  it('all tables exist after migration', async () => {
    const result = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'models', 'bento_pages', 'source_texts')
      ORDER BY table_name
    `);

    const tableNames = result.map((r: any) => r.table_name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('models');
    expect(tableNames).toContain('bento_pages');
    expect(tableNames).toContain('source_texts');
  });

  it('UNIQUE constraint on models(provider, name)', async () => {
    // Clean up any leftover data from prior runs
    await db.execute(sql`DELETE FROM models WHERE provider = 'test-provider' AND name = 'test-model-unique'`);
    await db.execute(sql`DELETE FROM users WHERE github_id = 99999`);

    // Create a test user first
    const [user] = await db.execute(sql`
      INSERT INTO users (github_id, username, avatar_url)
      VALUES (99999, 'test-unique-constraint', 'https://example.com/avatar.png')
      RETURNING id
    `);

    try {
      // Insert first model
      await db.execute(sql`
        INSERT INTO models (provider, name, display_name, created_by)
        VALUES ('test-provider', 'test-model-unique', 'Test Model', ${user.id})
      `);

      // Insert second model with same provider+name — should throw
      await expect(
        db.execute(sql`
          INSERT INTO models (provider, name, display_name, created_by)
          VALUES ('test-provider', 'test-model-unique', 'Test Model Duplicate', ${user.id})
        `)
      ).rejects.toThrow();
    } finally {
      // Cleanup: delete models first (FK dependency), then user
      await db.execute(sql`DELETE FROM models WHERE created_by = ${user.id}`);
      await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);
    }
  });

  it('CASCADE delete from models removes bento_pages and source_texts', async () => {
    // Clean up any leftover data from prior runs
    await db.execute(sql`DELETE FROM models WHERE provider = 'test-provider' AND name = 'test-model-cascade'`);
    await db.execute(sql`DELETE FROM users WHERE github_id = 99998`);

    // Create user
    const [user] = await db.execute(sql`
      INSERT INTO users (github_id, username, avatar_url)
      VALUES (99998, 'test-cascade', 'https://example.com/avatar.png')
      RETURNING id
    `);

    // Create model
    const [model] = await db.execute(sql`
      INSERT INTO models (provider, name, display_name, created_by)
      VALUES ('test-provider', 'test-model-cascade', 'Test Cascade', ${user.id})
      RETURNING id
    `);

    // Create bento_page
    await db.execute(sql`
      INSERT INTO bento_pages (model_id, layout, extracted, source_type)
      VALUES (${model.id}, '{"cards":[]}'::jsonb, '{"name":"test"}'::jsonb, 'text')
    `);

    // Create source_text
    await db.execute(sql`
      INSERT INTO source_texts (model_id, content)
      VALUES (${model.id}, 'test source text content')
    `);

    // Verify they exist
    const bentosBefore = await db.execute(sql`
      SELECT id FROM bento_pages WHERE model_id = ${model.id}
    `);
    expect(bentosBefore).toHaveLength(1);

    const sourcesBefore = await db.execute(sql`
      SELECT id FROM source_texts WHERE model_id = ${model.id}
    `);
    expect(sourcesBefore).toHaveLength(1);

    // Delete model — should cascade
    await db.execute(sql`DELETE FROM models WHERE id = ${model.id}`);

    // Verify bento_pages gone
    const bentosAfter = await db.execute(sql`
      SELECT id FROM bento_pages WHERE model_id = ${model.id}
    `);
    expect(bentosAfter).toHaveLength(0);

    // Verify source_texts gone
    const sourcesAfter = await db.execute(sql`
      SELECT id FROM source_texts WHERE model_id = ${model.id}
    `);
    expect(sourcesAfter).toHaveLength(0);

    // Cleanup
    await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);
  });
});
