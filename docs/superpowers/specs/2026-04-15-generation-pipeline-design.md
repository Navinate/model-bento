# Generation Pipeline with Batch API — Design Spec

## Goal

Wire up the full generation pipeline: form POST → PDF parse/text input → async Claude extraction via the Anthropic Batch API (50% cheaper) → preview → publish. Users see a "processing" card on their dashboard and return when extraction is ready.

## Architecture

The pipeline is async because the Batch API processes requests in the background (typically minutes, up to 24 hours). The app submits extraction jobs, polls for completion, and presents results when ready.

```
User submits /generate form
  ├── POST handler: parse input → create batch → insert job → redirect /dashboard
  │
  ▼
Background poller (setInterval, 60s):
  ├── SELECT jobs WHERE status='processing'
  ├── batches.retrieve(batch_id) → check if ended
  ├── If ended: fetch result → validate → UPDATE status='ready'
  └── If failed: UPDATE status='failed'
  │
  ▼
Dashboard shows job status cards:
  ├── "Processing..." for pending jobs
  ├── "Ready to preview" link for completed jobs
  └── "Failed" with error for failed jobs
  │
  ▼
/generate/preview?job=<id>
  ├── Load extracted data from job
  ├── Run layout engine → render bento preview
  ├── Check model doesn't already exist
  └── "Publish" button → publishModel() → redirect /m/:provider/:model
```

## Data Model

New `generation_jobs` table:

```sql
CREATE TABLE generation_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id),
    batch_id      TEXT NOT NULL,
    source_text   TEXT NOT NULL,
    source_type   TEXT NOT NULL DEFAULT 'text',
    status        TEXT NOT NULL DEFAULT 'processing',
    extracted     JSONB,
    error         TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);
```

Status values: `'processing'` → `'ready'` or `'failed'`.

`extracted` is null until the batch completes. When ready, it contains the validated `ExtractedModel` JSON (same schema as `bento_pages.extracted`).

`source_text` stores the raw text here (not in `source_texts` table) because the model doesn't exist yet — it moves to `source_texts` at publish time.

## Components

### 1. Schema update (`src/lib/schema.ts`)

Add `generationJobs` table to the Drizzle schema. Generate and apply migration.

### 2. Form POST handler (`src/pages/generate.astro`)

Handles the multipart form submission:
1. Check auth (already done — `getSession`)
2. Check ban status (already done)
3. Check rate limit via `checkRateLimit(redis, userId)`
4. Parse input: if PDF file uploaded → `parsePdf(buffer)`, else use text field
5. Validate input is non-empty
6. Create Anthropic batch: `client.messages.batches.create({ requests: [{ custom_id: jobId, params: { model, max_tokens, messages: [extraction prompt + source text] } }] })`
7. Insert `generation_jobs` row with `batch_id`, `source_text`, `source_type`, `status='processing'`
8. Redirect to `/dashboard`

### 3. Background poller (`src/lib/services/batch-poller.ts`)

Runs inside the Node process via `setInterval(pollPendingJobs, 60_000)`.

`pollPendingJobs()`:
1. SELECT all jobs WHERE `status = 'processing'`
2. For each job: `client.messages.batches.retrieve(job.batch_id)`
3. If `processing_status === 'ended'`:
   a. Fetch result via `client.messages.batches.results(batch_id)`
   b. Find the result matching the job's `custom_id`
   c. If `result.type === 'succeeded'`: parse response text as JSON, validate with `extractedModelSchema`, UPDATE job `status='ready'`, `extracted=data`
   d. If `result.type === 'errored'` or `'expired'`: UPDATE job `status='failed'`, `error=message`
4. If `processing_status !== 'ended'`: skip (still processing)

Started once at server boot in the Astro server entry point or middleware.

### 4. Dashboard updates (`src/pages/dashboard.astro`)

Add a "Pending Jobs" section above the published models:
- Query `generation_jobs` WHERE `user_id = currentUser AND status IN ('processing', 'ready')`
- Render each as a card:
  - `processing` → "Extracting model data..." with a subtle spinner/pulse
  - `ready` → "Ready to preview" with a link to `/generate/preview?job=<id>`
  - `failed` → "Extraction failed" with the error message

### 5. Preview page (`src/pages/generate/preview.astro`)

New page at `/generate/preview?job=<id>`:
1. Auth check
2. Load job by ID, verify `user_id` matches current user
3. Verify `status === 'ready'`
4. Parse `extracted` JSON, run `generateLayout(extracted)` → layout
5. Check `checkModelExists(extracted.provider, extracted.name)` — if exists, show "already exists" message with link
6. Render `BentoGrid` with the layout as a preview
7. "Publish" form button → POST to same page
8. POST handler: call `publishModel({ extracted, layout, sourceText, sourceType, userId })` → redirect to `/m/:provider/:model`
9. Delete the `generation_jobs` row after successful publish

### 6. Poller startup

The poller needs to start when the Node server boots. Options:
- Import and call `startBatchPoller()` from the Astro middleware (runs once on first request)
- Or from a server-startup hook if Astro supports one

The simplest: a module-level side effect in a file imported by middleware — `startBatchPoller()` is idempotent (checks a `started` flag).

## Existing code changes

- **`src/lib/services/llm-extractor.ts`**: The extraction prompt and Zod schema are reused. The batch request uses the same prompt text — just submitted via `batches.create` instead of `messages.create`.
- **`src/lib/services/generate.ts`**: The synchronous `processGeneration` function is no longer called from the form handler. The batch flow replaces it. The function can remain for testing / future sync use.
- **`src/lib/services/publish.ts`**: Called unchanged from the preview page's POST handler.

## Batch API details

- SDK: `client.messages.batches.create({ requests: [...] })` → returns `{ id, processing_status }`
- Poll: `client.messages.batches.retrieve(batchId)` → `{ processing_status: 'in_progress' | 'ended' | ... }`
- Results: `client.messages.batches.results(batchId)` → async iterable of `{ custom_id, result: { type, message? } }`
- Cost: 50% of standard pricing on all tokens
- Limits: up to 100K requests per batch, 256MB max
- Completion: most within 1 hour, max 24 hours

## Verification

1. Submit a model card → redirected to dashboard → see "Processing..." card
2. Wait for poller to pick it up (≤60s poll interval + batch processing time)
3. Dashboard shows "Ready to preview" → click → see bento grid preview
4. Click "Publish" → model page created at `/m/:provider/:model`
5. Dashboard no longer shows the job (cleaned up)
6. Rate limit prevents more than 5 submissions per hour
