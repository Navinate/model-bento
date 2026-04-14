import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../src/lib/schema';
import { processGeneration } from '../../src/lib/services/generate';
import { requireAuth } from '../../src/lib/auth';

const fixturesDir = join(__dirname, '..', 'fixtures');
const sampleText = readFileSync(join(fixturesDir, 'sample-model-card.txt'), 'utf-8');
const samplePdf = readFileSync(join(fixturesDir, 'sample-model-card.pdf'));
const sampleExtracted = JSON.parse(readFileSync(join(fixturesDir, 'sample-extracted.json'), 'utf-8'));

/** Mock Anthropic client that returns a fixed extraction result. */
function mockClient(response: object) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text' as const, text: JSON.stringify(response) }],
      }),
    },
  };
}

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

describe('generate service', () => {
  it('text input → extraction → preview data returned', async () => {
    const client = mockClient(sampleExtracted);

    const result = await processGeneration(
      { type: 'text', text: sampleText },
      { client: client as any, db },
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected success');
    expect(result.extracted.provider).toBe('anthropic');
    expect(result.extracted.name).toBe('claude-sonnet-4');
    expect(result.extracted.display_name).toBe('Claude Sonnet 4');
    expect(result.extracted.benchmarks.length).toBeGreaterThan(0);
    expect(result.sourceText).toBe(sampleText);
    expect(result.sourceType).toBe('text');
  });

  it('PDF input → parse → extraction → preview data returned', async () => {
    const client = mockClient(sampleExtracted);

    const result = await processGeneration(
      { type: 'pdf', buffer: samplePdf },
      { client: client as any, db },
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected success');
    expect(result.extracted.provider).toBe('anthropic');
    expect(result.extracted.name).toBe('claude-sonnet-4');
    expect(result.sourceType).toBe('pdf');
    // sourceText should be the parsed PDF text, not the raw buffer
    expect(typeof result.sourceText).toBe('string');
    expect(result.sourceText.length).toBeGreaterThan(0);
  });

  it('existing model returns "already exists" with link', async () => {
    // Clean up any leftover data
    await db.execute(sql`DELETE FROM models WHERE provider = 'anthropic' AND name = 'claude-sonnet-4'`);
    await db.execute(sql`DELETE FROM users WHERE github_id = 99960`);

    // Seed a user and model
    const [user] = await db.execute(sql`
      INSERT INTO users (github_id, username, avatar_url)
      VALUES (99960, 'test-generate', 'https://example.com/avatar.png')
      RETURNING id
    `);
    await db.execute(sql`
      INSERT INTO models (provider, name, display_name, created_by)
      VALUES ('anthropic', 'claude-sonnet-4', 'Claude Sonnet 4', ${user.id})
    `);

    try {
      const client = mockClient(sampleExtracted);

      const result = await processGeneration(
        { type: 'text', text: sampleText },
        { client: client as any, db },
      );

      expect(result.status).toBe('exists');
      if (result.status !== 'exists') throw new Error('Expected exists');
      expect(result.provider).toBe('anthropic');
      expect(result.name).toBe('claude-sonnet-4');
    } finally {
      await db.execute(sql`DELETE FROM models WHERE provider = 'anthropic' AND name = 'claude-sonnet-4'`);
      await db.execute(sql`DELETE FROM users WHERE github_id = 99960`);
    }
  });

  it('unauthenticated request is rejected', () => {
    // The generate page uses requireAuth before calling processGeneration.
    // Verify requireAuth rejects null sessions with a redirect.
    const result = requireAuth(null, '/generate');

    expect(result.redirect).toBeDefined();
    expect(result.redirect).toContain('/auth/login');
    expect(result.redirect).toContain('callbackUrl');
    expect(result.session).toBeUndefined();
  });
});
