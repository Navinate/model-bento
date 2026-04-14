import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../src/lib/schema';
import { checkModelExists } from '../../src/lib/services/model-check';

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

describe('model-check', () => {
  it('returns { exists: false } for unknown model', async () => {
    const result = await checkModelExists('nonexistent', 'model', { db });

    expect(result).toEqual({ exists: false });
  });

  it('returns { exists: true, provider, name } for existing model', async () => {
    // Clean up any leftover data
    await db.execute(sql`DELETE FROM models WHERE provider = 'test-check' AND name = 'test-model-check'`);
    await db.execute(sql`DELETE FROM users WHERE github_id = 99950`);

    // Create a test user
    const [user] = await db.execute(sql`
      INSERT INTO users (github_id, username, avatar_url)
      VALUES (99950, 'test-model-check', 'https://example.com/avatar.png')
      RETURNING id
    `);

    // Insert a model
    await db.execute(sql`
      INSERT INTO models (provider, name, display_name, created_by)
      VALUES ('test-check', 'test-model-check', 'Test Model Check', ${user.id})
    `);

    try {
      const result = await checkModelExists('test-check', 'test-model-check', { db });

      expect(result).toEqual({
        exists: true,
        provider: 'test-check',
        name: 'test-model-check',
      });
    } finally {
      // Cleanup
      await db.execute(sql`DELETE FROM models WHERE provider = 'test-check' AND name = 'test-model-check'`);
      await db.execute(sql`DELETE FROM users WHERE github_id = 99950`);
    }
  });
});
