import type Redis from 'ioredis';
import { eq, and } from 'drizzle-orm';
import { db as defaultDb } from '../db';
import { models, bentoPages } from '../schema';
import { cacheGet, cacheSet } from '../redis';
import type { ExtractedModel } from './llm-extractor';
import type { LayoutCard } from '../layout-engine';

type Db = typeof defaultDb;

interface BentoData {
  extracted: ExtractedModel;
  layout: LayoutCard[];
  displayName: string;
  provider: string;
}

interface BentoCacheOptions {
  db?: Db;
  redis?: Redis;
}

function cacheKey(provider: string, name: string): string {
  return `bento:data:${provider}:${name}`;
}

export async function getBentoData(
  provider: string,
  name: string,
  options?: BentoCacheOptions,
): Promise<BentoData | null> {
  const redis = options?.redis;
  const db = options?.db ?? defaultDb;
  const key = cacheKey(provider, name);

  // Try cache first
  if (redis) {
    const cached = await cacheGet<BentoData>(redis, key);
    if (cached) return cached;
  }

  // Fetch from DB
  const [result] = await db
    .select({
      displayName: models.displayName,
      provider: models.provider,
      layout: bentoPages.layout,
      extracted: bentoPages.extracted,
    })
    .from(models)
    .innerJoin(bentoPages, eq(bentoPages.modelId, models.id))
    .where(and(eq(models.provider, provider), eq(models.name, name)))
    .limit(1);

  if (!result) return null;

  const data: BentoData = {
    extracted: result.extracted as ExtractedModel,
    layout: result.layout as LayoutCard[],
    displayName: result.displayName,
    provider: result.provider,
  };

  // Populate cache (no TTL — immutable until admin action)
  if (redis) {
    await cacheSet(redis, key, data);
  }

  return data;
}
