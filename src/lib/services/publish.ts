import type Redis from 'ioredis';
import { db as defaultDb } from '../db';
import { models, bentoPages, sourceTexts } from '../schema';
import { cacheDelete } from '../redis';
import type { ExtractedModel } from './llm-extractor';
import type { LayoutCard } from '../layout-engine';

type Db = typeof defaultDb;

interface PublishInput {
  extracted: ExtractedModel;
  layout: LayoutCard[];
  sourceText: string;
  sourceType: 'text' | 'pdf';
  userId: string;
}

interface PublishOptions {
  db?: Db;
  redis?: Redis;
}

export async function publishModel(
  input: PublishInput,
  options?: PublishOptions,
): Promise<{ modelId: string }> {
  const db = options?.db ?? defaultDb;

  // Single transaction: insert model + bento_page + source_text
  const result = await db.transaction(async (tx) => {
    const [model] = await tx.insert(models).values({
      provider: input.extracted.provider,
      name: input.extracted.name,
      displayName: input.extracted.display_name,
      createdBy: input.userId,
    }).returning({ id: models.id });

    await tx.insert(bentoPages).values({
      modelId: model.id,
      layout: input.layout,
      extracted: input.extracted,
      sourceType: input.sourceType,
    });

    await tx.insert(sourceTexts).values({
      modelId: model.id,
      content: input.sourceText,
    });

    return { modelId: model.id };
  });

  // Invalidate explore cache after successful transaction
  if (options?.redis) {
    await cacheDelete(options.redis, 'explore:models');
  }

  return result;
}
