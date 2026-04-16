# Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the full generation pipeline using the Anthropic Batch API for 50% cheaper async extraction, with dashboard status tracking and a preview/publish flow.

**Architecture:** User submits a model card → server creates an Anthropic batch → stores a `generation_jobs` row → background poller checks for completion every 60s → dashboard shows status → user previews and publishes when ready.

**Tech Stack:** Astro 5 SSR, Drizzle ORM, Anthropic TypeScript SDK (`client.messages.batches`), existing `pdf-parser`, `llm-extractor` (Zod schema + prompt), `layout-engine`, `publish` services.

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/schema.ts` | Modify | Add `generationJobs` table |
| `drizzle/0001_generation_jobs.sql` | Generated | Migration for new table |
| `src/lib/services/batch-poller.ts` | Create | Background polling loop + result processing |
| `src/pages/generate.astro` | Modify | Add POST handler for form submission |
| `src/pages/generate/preview.astro` | Create | Preview + publish page |
| `src/pages/dashboard.astro` | Modify | Add job status cards |
| `src/middleware/index.ts` | Modify | Start poller on first request |
| `tests/services/batch-poller.test.ts` | Create | Tests for polling logic |
| `tests/services/generate-submit.test.ts` | Create | Tests for batch submission logic |

---

### Task 1: Add `generationJobs` table to Drizzle schema

**Files:**
- Modify: `src/lib/schema.ts`

- [ ] **Step 1: Add the table definition**

Add to the end of `src/lib/schema.ts`:

```typescript
export const generationJobs = pgTable('generation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  batchId: text('batch_id').notNull(),
  sourceText: text('source_text').notNull(),
  sourceType: text('source_type').notNull().default('text'),
  status: text('status').notNull().default('processing'),
  extracted: jsonb('extracted'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

- [ ] **Step 2: Generate the migration**

```bash
bunx drizzle-kit generate
```

Expected: Creates a new file in `drizzle/` (e.g., `0001_generation_jobs.sql`) with the `CREATE TABLE generation_jobs` statement.

- [ ] **Step 3: Apply the migration locally**

```bash
bunx drizzle-kit migrate
```

Expected: "1 migration applied" against the local dev database.

- [ ] **Step 4: Apply migration to production**

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL from railway variables --service Postgres>' bunx drizzle-kit migrate
```

Get the public URL via:

```bash
railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL
```

Expected: Migration applied to production Postgres.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schema.ts drizzle/
git commit -m "Add generation_jobs table for async batch extraction"
```

---

### Task 2: Create batch submission service

**Files:**
- Create: `src/lib/services/batch-submit.ts`
- Create: `tests/services/batch-submit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/services/batch-submit.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { submitExtractionBatch } from '../../src/lib/services/batch-submit';

function mockBatchClient(batchId: string) {
  return {
    messages: {
      batches: {
        create: vi.fn().mockResolvedValue({
          id: batchId,
          processing_status: 'in_progress',
        }),
      },
    },
  };
}

describe('batch-submit', () => {
  it('creates a batch with the extraction prompt and returns batch ID', async () => {
    const client = mockBatchClient('msgbatch_test123');

    const result = await submitExtractionBatch(
      'Sample model card text about Claude Sonnet...',
      'job-uuid-123',
      { client: client as any },
    );

    expect(result.batchId).toBe('msgbatch_test123');
    expect(client.messages.batches.create).toHaveBeenCalledOnce();

    const call = client.messages.batches.create.mock.calls[0][0];
    expect(call.requests).toHaveLength(1);
    expect(call.requests[0].custom_id).toBe('job-uuid-123');
    expect(call.requests[0].params.model).toBe('claude-sonnet-4-20250514');
    expect(call.requests[0].params.messages[0].content).toContain('Sample model card text');
  });

  it('includes the extraction prompt in the request', async () => {
    const client = mockBatchClient('msgbatch_test456');

    await submitExtractionBatch('Some text', 'job-1', { client: client as any });

    const call = client.messages.batches.create.mock.calls[0][0];
    const messageContent = call.requests[0].params.messages[0].content;
    expect(messageContent).toContain('structured data extractor');
    expect(messageContent).toContain('Some text');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test -- tests/services/batch-submit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `src/lib/services/batch-submit.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { EXTRACTION_PROMPT } from './llm-extractor';

interface BatchSubmitOptions {
  client?: Anthropic;
}

export async function submitExtractionBatch(
  sourceText: string,
  jobId: string,
  options?: BatchSubmitOptions,
): Promise<{ batchId: string }> {
  const client = options?.client ?? new Anthropic();

  const batch = await client.messages.batches.create({
    requests: [
      {
        custom_id: jobId,
        params: {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: `${EXTRACTION_PROMPT}\n\n---\n\n${sourceText}`,
            },
          ],
        },
      },
    ],
  });

  return { batchId: batch.id };
}
```

This requires exporting `EXTRACTION_PROMPT` from `llm-extractor.ts`. Add `export` before the existing `const EXTRACTION_PROMPT` declaration in `src/lib/services/llm-extractor.ts:41`:

Change line 41 from:
```typescript
const EXTRACTION_PROMPT = `You are a structured data extractor...`;
```
to:
```typescript
export const EXTRACTION_PROMPT = `You are a structured data extractor...`;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test -- tests/services/batch-submit.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/batch-submit.ts src/lib/services/llm-extractor.ts tests/services/batch-submit.test.ts
git commit -m "Add batch submission service for async extraction"
```

---

### Task 3: Create background batch poller

**Files:**
- Create: `src/lib/services/batch-poller.ts`
- Create: `tests/services/batch-poller.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/services/batch-poller.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../src/lib/schema';
import { processCompletedBatch } from '../../src/lib/services/batch-poller';
import { extractedModelSchema } from '../../src/lib/services/llm-extractor';
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run test -- tests/services/batch-poller.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the poller**

Create `src/lib/services/batch-poller.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../db';
import { generationJobs } from '../schema';
import { extractedModelSchema } from './llm-extractor';

type Db = typeof defaultDb;

interface PollerOptions {
  db?: Db;
  client?: Anthropic;
}

export async function processCompletedBatch(
  jobId: string,
  result: any,
  options?: { db?: Db },
): Promise<void> {
  const db = options?.db ?? defaultDb;

  if (result.result.type === 'succeeded') {
    try {
      const content = result.result.message.content[0];
      if (content.type !== 'text') throw new Error('Unexpected response type');

      const parsed = JSON.parse(content.text);
      const extracted = extractedModelSchema.parse(parsed);

      await db
        .update(generationJobs)
        .set({ status: 'ready', extracted })
        .where(eq(generationJobs.id, jobId));
    } catch (err) {
      await db
        .update(generationJobs)
        .set({
          status: 'failed',
          error: `Extraction validation failed: ${err instanceof Error ? err.message : String(err)}`,
        })
        .where(eq(generationJobs.id, jobId));
    }
  } else {
    const errorMsg = result.result.error?.message ?? result.result.type;
    await db
      .update(generationJobs)
      .set({ status: 'failed', error: errorMsg })
      .where(eq(generationJobs.id, jobId));
  }
}

export async function pollPendingJobs(options?: PollerOptions): Promise<void> {
  const db = options?.db ?? defaultDb;
  const client = options?.client ?? new Anthropic();

  const pendingJobs = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.status, 'processing'));

  for (const job of pendingJobs) {
    try {
      const batch = await client.messages.batches.retrieve(job.batchId);

      if (batch.processing_status !== 'ended') continue;

      for await (const result of await client.messages.batches.results(job.batchId)) {
        if (result.custom_id === job.id) {
          await processCompletedBatch(job.id, result, { db });
          break;
        }
      }
    } catch (err) {
      console.error(`Failed to poll job ${job.id}:`, err);
    }
  }
}

let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

export function startBatchPoller(options?: PollerOptions): void {
  if (started) return;
  started = true;

  console.log('[batch-poller] Starting background poller (60s interval)');
  intervalId = setInterval(() => {
    pollPendingJobs(options).catch((err) =>
      console.error('[batch-poller] Poll error:', err),
    );
  }, 60_000);
}

export function stopBatchPoller(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  started = false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run test -- tests/services/batch-poller.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/batch-poller.ts tests/services/batch-poller.test.ts
git commit -m "Add background batch poller for async extraction jobs"
```

---

### Task 4: Wire up the generate page POST handler

**Files:**
- Modify: `src/pages/generate.astro`

- [ ] **Step 1: Rewrite generate.astro with POST handling**

Replace the entire contents of `src/pages/generate.astro` with:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import '../styles/global.css';
import { getSession } from 'auth-astro/server';
import { requireAuth } from '../lib/auth';
import { db } from '../lib/db';
import { users, generationJobs } from '../lib/schema';
import { eq } from 'drizzle-orm';
import { parsePdf } from '../lib/services/pdf-parser';
import { submitExtractionBatch } from '../lib/services/batch-submit';
import { checkRateLimit } from '../lib/services/rate-limit';
import { createRedisClient } from '../lib/redis';
import { randomUUID } from 'crypto';

const session = await getSession(Astro.request);
const auth = requireAuth(session as any, '/generate');

if (auth.redirect) {
  return Astro.redirect(auth.redirect);
}

const [user] = await db.select().from(users).where(eq(users.id, auth.session!.user.id));
const isBanned = user?.bannedAt != null;

let error = '';

if (Astro.request.method === 'POST' && !isBanned) {
  try {
    // Rate limit check
    const redis = createRedisClient();
    try {
      const limit = await checkRateLimit(redis, auth.session!.user.id);
      if (!limit.allowed) {
        error = `Rate limit exceeded. Try again in ${Math.ceil((limit.retryAfter ?? 3600) / 60)} minutes.`;
      }
    } finally {
      await redis.quit();
    }

    if (!error) {
      const formData = await Astro.request.formData();
      const pdfFile = formData.get('pdf') as File | null;
      const textInput = formData.get('text') as string | null;

      let sourceText = '';
      let sourceType: 'pdf' | 'text' = 'text';

      if (pdfFile && pdfFile.size > 0) {
        const buffer = Buffer.from(await pdfFile.arrayBuffer());
        sourceText = await parsePdf(buffer);
        sourceType = 'pdf';
      } else if (textInput && textInput.trim()) {
        sourceText = textInput.trim();
        sourceType = 'text';
      }

      if (!sourceText) {
        error = 'Please upload a PDF or paste model card text.';
      } else {
        const jobId = randomUUID();
        const { batchId } = await submitExtractionBatch(sourceText, jobId);

        await db.insert(generationJobs).values({
          id: jobId,
          userId: auth.session!.user.id,
          batchId,
          sourceText,
          sourceType,
          status: 'processing',
        });

        return Astro.redirect('/dashboard');
      }
    }
  } catch (err) {
    console.error('Generate error:', err);
    error = 'Something went wrong. Please try again.';
  }
}
---

<BaseLayout title="Generate — Model Bento">
  <main class="mx-auto max-w-3xl p-8">
    {isBanned ? (
      <div class="text-center py-16" data-suspended>
        <h1 class="text-3xl font-bold text-slate-900">Account Suspended</h1>
        <p class="mt-4 text-slate-500">
          Your account has been suspended and you cannot generate new bento pages.
        </p>
        {user.bannedReason && (
          <p class="mt-2 text-sm text-slate-400">Reason: {user.bannedReason}</p>
        )}
      </div>
    ) : (
      <div>
        <h1 class="text-3xl font-bold text-slate-900 mb-8">Generate Bento Page</h1>
        <p class="text-slate-500 mb-6">Upload a model card PDF or paste the text. Extraction runs in the background — check your dashboard for results.</p>

        {error && (
          <div class="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form method="POST" enctype="multipart/form-data" class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Upload PDF</label>
            <input
              type="file"
              name="pdf"
              accept=".pdf"
              class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            />
          </div>
          <div class="text-center text-sm text-slate-400">— or —</div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Paste model card text</label>
            <textarea
              name="text"
              rows={10}
              class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm resize-y"
              placeholder="Paste the full model card text here..."
            ></textarea>
          </div>
          <button
            type="submit"
            class="w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white hover:bg-slate-800"
          >
            Generate Bento
          </button>
        </form>
      </div>
    )}
  </main>
</BaseLayout>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/generate.astro
git commit -m "Wire up generate form POST: parse input, create batch, insert job"
```

---

### Task 5: Update dashboard to show job status

**Files:**
- Modify: `src/pages/dashboard.astro`

- [ ] **Step 1: Rewrite dashboard.astro with job cards**

Replace the entire contents of `src/pages/dashboard.astro` with:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import '../styles/global.css';
import { getSession } from 'auth-astro/server';
import { requireAuth } from '../lib/auth';
import { db } from '../lib/db';
import { models, bentoPages, generationJobs } from '../lib/schema';
import { eq, inArray } from 'drizzle-orm';

const session = await getSession(Astro.request);
const auth = requireAuth(session as any, '/dashboard');

if (auth.redirect) {
  return Astro.redirect(auth.redirect);
}

const userId = auth.session!.user.id;

const jobs = await db
  .select()
  .from(generationJobs)
  .where(eq(generationJobs.userId, userId))
  .orderBy(generationJobs.createdAt);

const activeJobs = jobs.filter((j) => j.status === 'processing' || j.status === 'ready' || j.status === 'failed');

const userModels = await db
  .select({
    provider: models.provider,
    name: models.name,
    displayName: models.displayName,
  })
  .from(models)
  .innerJoin(bentoPages, eq(bentoPages.modelId, models.id))
  .where(eq(models.createdBy, userId));
---

<BaseLayout title="Dashboard — Model Bento">
  <main class="mx-auto max-w-5xl p-8">
    <h1 class="text-3xl font-bold text-slate-900 mb-8">Dashboard</h1>

    {activeJobs.length > 0 && (
      <div class="mb-8">
        <h2 class="text-lg font-semibold text-slate-900 mb-4">Pending Extractions</h2>
        <div class="space-y-3">
          {activeJobs.map((job) => (
            <div class="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between">
              {job.status === 'processing' && (
                <>
                  <div>
                    <p class="text-sm font-medium text-slate-900">Extracting model data...</p>
                    <p class="text-xs text-slate-500 mt-1">Submitted {new Date(job.createdAt!).toLocaleString()}</p>
                  </div>
                  <div class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"></div>
                </>
              )}
              {job.status === 'ready' && (
                <>
                  <div>
                    <p class="text-sm font-medium text-green-700">Ready to preview</p>
                    <p class="text-xs text-slate-500 mt-1">Extraction complete</p>
                  </div>
                  <a
                    href={`/generate/preview?job=${job.id}`}
                    class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Preview
                  </a>
                </>
              )}
              {job.status === 'failed' && (
                <div>
                  <p class="text-sm font-medium text-red-600">Extraction failed</p>
                  <p class="text-xs text-slate-500 mt-1">{job.error ?? 'Unknown error'}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )}

    <h2 class="text-lg font-semibold text-slate-900 mb-4">Your Bento Pages</h2>
    {userModels.length > 0 ? (
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {userModels.map((m) => (
          <a
            href={`/m/${m.provider}/${m.name}`}
            class="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
          >
            <p class="text-xs font-medium uppercase tracking-wider text-slate-500">
              {m.provider}
            </p>
            <p class="mt-1 text-lg font-semibold text-slate-900">{m.displayName}</p>
          </a>
        ))}
      </div>
    ) : (
      <div class="text-center py-16" data-empty-state>
        <p class="text-lg text-slate-500">You haven't created any bento pages yet.</p>
        <a href="/generate" class="mt-4 inline-block rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white hover:bg-slate-800">
          Create your first bento
        </a>
      </div>
    )}
  </main>
</BaseLayout>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/dashboard.astro
git commit -m "Show generation job status cards on dashboard"
```

---

### Task 6: Create preview + publish page

**Files:**
- Create: `src/pages/generate/preview.astro`

- [ ] **Step 1: Create the preview page**

Create `src/pages/generate/preview.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import '../../styles/global.css';
import { getSession } from 'auth-astro/server';
import { requireAuth } from '../../lib/auth';
import { db } from '../../lib/db';
import { generationJobs } from '../../lib/schema';
import { eq } from 'drizzle-orm';
import { BentoGrid } from '../../components/bento/BentoGrid';
import { generateLayout } from '../../lib/layout-engine';
import { checkModelExists } from '../../lib/services/model-check';
import { publishModel } from '../../lib/services/publish';
import type { ExtractedModel } from '../../lib/services/llm-extractor';

const session = await getSession(Astro.request);
const auth = requireAuth(session as any, '/generate/preview');

if (auth.redirect) {
  return Astro.redirect(auth.redirect);
}

const jobId = Astro.url.searchParams.get('job');
if (!jobId) {
  return Astro.redirect('/dashboard');
}

const [job] = await db
  .select()
  .from(generationJobs)
  .where(eq(generationJobs.id, jobId));

if (!job || job.userId !== auth.session!.user.id || job.status !== 'ready') {
  return Astro.redirect('/dashboard');
}

const extracted = job.extracted as ExtractedModel;
const layout = generateLayout(extracted);

const existsCheck = await checkModelExists(extracted.provider, extracted.name);

let publishError = '';

if (Astro.request.method === 'POST' && !existsCheck.exists) {
  try {
    await publishModel({
      extracted,
      layout,
      sourceText: job.sourceText,
      sourceType: job.sourceType as 'text' | 'pdf',
      userId: auth.session!.user.id,
    });

    // Clean up the job
    await db.delete(generationJobs).where(eq(generationJobs.id, jobId));

    return Astro.redirect(`/m/${extracted.provider}/${extracted.name}`);
  } catch (err) {
    console.error('Publish error:', err);
    publishError = 'Failed to publish. The model may already exist.';
  }
}
---

<BaseLayout title={`Preview: ${extracted.display_name} — Model Bento`}>
  <main class="mx-auto max-w-7xl p-8">
    <a href="/dashboard" class="text-sm text-slate-500 hover:text-slate-900">← Back to Dashboard</a>

    <div class="mt-4 mb-8 flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-slate-900">{extracted.display_name}</h1>
        <p class="text-sm text-slate-500 mt-1">{extracted.provider}/{extracted.name}</p>
      </div>

      {existsCheck.exists ? (
        <div class="rounded-lg bg-yellow-50 px-4 py-2 text-sm text-yellow-700">
          This model already has a page.
          <a href={`/m/${extracted.provider}/${extracted.name}`} class="underline ml-1">View it</a>
        </div>
      ) : (
        <form method="POST">
          {publishError && (
            <p class="text-sm text-red-600 mb-2">{publishError}</p>
          )}
          <button
            type="submit"
            class="rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white hover:bg-slate-800"
          >
            Publish
          </button>
        </form>
      )}
    </div>

    <BentoGrid layout={layout} client:load />
  </main>
</BaseLayout>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/generate/preview.astro
git commit -m "Add preview page with publish flow for extraction results"
```

---

### Task 7: Start the poller from middleware

**Files:**
- Modify: `src/middleware/index.ts`

- [ ] **Step 1: Import and start the poller**

Replace the contents of `src/middleware/index.ts`:

```typescript
import { defineMiddleware } from 'astro:middleware';
import { getSession as getAuthSession } from 'auth-astro/server';
import { getSession } from '../lib/auth';
import { isAdmin } from '../lib/admin';
import { startBatchPoller } from '../lib/services/batch-poller';

// Start the background poller once on first request
startBatchPoller();

export const onRequest = defineMiddleware(async (context, next) => {
  // Only gate /admin routes
  if (!context.url.pathname.startsWith('/admin')) {
    return next();
  }

  // Get session from Auth.js via auth-astro (reads from cookie)
  const session = await getAuthSession(context.request);
  const validSession = getSession(session as any);

  // No session or not admin → 404 (not 403, to hide route existence)
  if (!validSession || !isAdmin(validSession.user.githubId)) {
    return new Response(null, { status: 404 });
  }

  return next();
});
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/index.ts
git commit -m "Start batch poller on server boot via middleware import"
```

---

### Task 8: Run full test suite and deploy

**Files:** None (validation only)

- [ ] **Step 1: Run Vitest suite**

```bash
bun run test
```

Expected: All tests pass (existing 65 + 5 new = ~70).

- [ ] **Step 2: Push to git**

```bash
git push
```

- [ ] **Step 3: Deploy to Railway**

```bash
railway up --detach
```

Wait for deploy to succeed:

```bash
railway deployment list
```

Expected: Latest deployment shows `SUCCESS`.

- [ ] **Step 4: Apply production migration (if not done in Task 1)**

Verify the `generation_jobs` table exists in production:

```bash
railway connect postgres
```

Then:

```sql
\dt generation_jobs
\q
```

If missing, run the migration from Task 1 Step 4.

- [ ] **Step 5: Smoke test the full flow**

1. Open `https://model-bento-production.up.railway.app/generate`
2. Paste model card text or upload a PDF
3. Click "Generate Bento" → redirected to `/dashboard`
4. See "Extracting model data..." card with spinner
5. Wait for poller (refresh dashboard every ~60s)
6. See "Ready to preview" → click "Preview"
7. See bento grid with model data
8. Click "Publish" → redirected to `/m/:provider/:model`

- [ ] **Step 6: Commit plan completion**

```bash
git add PLAN.md
git commit -m "Generation pipeline complete: batch API, poller, preview, publish"
git push
```
