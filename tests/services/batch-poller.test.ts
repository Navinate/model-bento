import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../src/lib/schema';
import { processCompletedBatch } from '../../src/lib/services/batch-poller';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixturesDir = join(__dirname, '..', 'fixtures');
const sampleExtracted = JSON.parse(readFileSync(join(fixturesDir, 'sample-extracted.json'), 'utf-8'));

let queryClient: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');
  queryClient = postgres(databaseUrl);
  db = drizzle(queryClient, { schema });
});

afterEach(async () => {
  await db.execute(sql`DELETE FROM generation_jobs WHERE batch_id LIKE 'test_%'`);
  await db.execute(sql`DELETE FROM users WHERE github_id = 99800`);
});

afterAll(async () => {
  await queryClient.end();
});

async function seedJob(batchId: string) {
  const [user] = await db.execute(sql`
    INSERT INTO users (github_id, username, avatar_url)
    VALUES (99800, 'test-poller', 'https://example.com/avatar.png')
    ON CONFLICT (github_id) DO UPDATE SET username = 'test-poller'
    RETURNING id
  `);

  const [job] = await db.insert(schema.generationJobs).values({
    userId: user.id as string,
    batchId,
    sourceText: 'test source text',
    sourceType: 'text',
    status: 'processing',
  }).returning();

  return { userId: user.id as string, jobId: job.id };
}

describe('batch-poller', () => {
  it('updates job to ready when batch succeeds', async () => {
    const { jobId } = await seedJob('test_batch_success');

    const mockResult = {
      custom_id: jobId,
      result: {
        type: 'succeeded' as const,
        message: {
          content: [{ type: 'text' as const, text: JSON.stringify(sampleExtracted) }],
        },
      },
    };

    await processCompletedBatch(jobId, mockResult, { db });

    const [updated] = await db
      .select()
      .from(schema.generationJobs)
      .where(eq(schema.generationJobs.id, jobId));

    expect(updated.status).toBe('ready');
    expect(updated.extracted).not.toBeNull();
    expect((updated.extracted as any).provider).toBe('anthropic');
  });

  it('updates job to failed when batch errors', async () => {
    const { jobId } = await seedJob('test_batch_error');

    const mockResult = {
      custom_id: jobId,
      result: {
        type: 'errored' as const,
        error: { type: 'server_error', message: 'Internal error' },
      },
    };

    await processCompletedBatch(jobId, mockResult, { db });

    const [updated] = await db
      .select()
      .from(schema.generationJobs)
      .where(eq(schema.generationJobs.id, jobId));

    expect(updated.status).toBe('failed');
    expect(updated.error).toContain('Internal error');
  });

  it('updates job to failed when extraction JSON is invalid', async () => {
    const { jobId } = await seedJob('test_batch_bad_json');

    const mockResult = {
      custom_id: jobId,
      result: {
        type: 'succeeded' as const,
        message: {
          content: [{ type: 'text' as const, text: 'not valid json {{{' }],
        },
      },
    };

    await processCompletedBatch(jobId, mockResult, { db });

    const [updated] = await db
      .select()
      .from(schema.generationJobs)
      .where(eq(schema.generationJobs.id, jobId));

    expect(updated.status).toBe('failed');
    expect(updated.error).toBeDefined();
  });
});
