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
