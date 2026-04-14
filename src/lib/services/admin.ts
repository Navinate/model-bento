import type Redis from 'ioredis';
import { eq, and, sql } from 'drizzle-orm';
import { db as defaultDb } from '../db';
import { models, bentoPages, sourceTexts, users } from '../schema';
import { cacheDelete } from '../redis';
import { extractModelCard, type ExtractedModel } from './llm-extractor';
import { generateLayout } from '../layout-engine';
import type Anthropic from '@anthropic-ai/sdk';

type Db = typeof defaultDb;

interface AdminOptions {
  db?: Db;
  redis?: Redis;
}

/** Delete a model and all associated data. */
export async function deleteModel(
  provider: string,
  name: string,
  options?: AdminOptions,
): Promise<void> {
  const db = options?.db ?? defaultDb;

  // CASCADE deletes handle bento_pages + source_texts
  await db.delete(models).where(
    and(eq(models.provider, provider), eq(models.name, name)),
  );

  // Invalidate caches
  if (options?.redis) {
    await cacheDelete(options.redis, `bento:data:${provider}:${name}`);
    await cacheDelete(options.redis, 'explore:models');
  }
}

/** Regenerate a model's bento page from its stored source text. */
export async function regenerateModel(
  provider: string,
  name: string,
  options?: AdminOptions & { client?: Anthropic },
): Promise<{ extracted: ExtractedModel }> {
  const db = options?.db ?? defaultDb;

  // Fetch source text
  const [result] = await db
    .select({
      modelId: models.id,
      content: sourceTexts.content,
    })
    .from(models)
    .innerJoin(sourceTexts, eq(sourceTexts.modelId, models.id))
    .where(and(eq(models.provider, provider), eq(models.name, name)))
    .limit(1);

  if (!result) {
    throw new Error(`Model ${provider}/${name} not found or has no source text`);
  }

  // Re-extract
  const extracted = await extractModelCard(result.content, { client: options?.client });
  const layout = generateLayout(extracted);

  // Update bento page
  await db
    .update(bentoPages)
    .set({
      extracted,
      layout,
      updatedAt: sql`now()`,
    })
    .where(eq(bentoPages.modelId, result.modelId));

  // Invalidate caches
  if (options?.redis) {
    await cacheDelete(options.redis, `bento:data:${provider}:${name}`);
    await cacheDelete(options.redis, 'explore:models');
  }

  return { extracted };
}

/** Ban a user by setting banned_at and optional reason. */
export async function banUser(
  userId: string,
  reason: string | null,
  options?: { db?: Db },
): Promise<void> {
  const db = options?.db ?? defaultDb;

  await db
    .update(users)
    .set({
      bannedAt: sql`now()`,
      bannedReason: reason,
      updatedAt: sql`now()`,
    })
    .where(eq(users.id, userId));
}

/** Unban a user by clearing banned_at and banned_reason. */
export async function unbanUser(
  userId: string,
  options?: { db?: Db },
): Promise<void> {
  const db = options?.db ?? defaultDb;

  await db
    .update(users)
    .set({
      bannedAt: null,
      bannedReason: null,
      updatedAt: sql`now()`,
    })
    .where(eq(users.id, userId));
}
