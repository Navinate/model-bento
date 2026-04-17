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
