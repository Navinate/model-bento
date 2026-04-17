import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';

const benchmarkSchema = z.object({
  name: z.string(),
  score: z.number(),
  unit: z.string().optional(),
});

const highlightSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const extractedModelSchema = z.object({
  provider: z.string(),
  name: z.string(),
  display_name: z.string(),
  description: z.string().optional(),
  parameter_count: z.string().optional(),
  context_window: z.number().optional(),
  benchmarks: z.array(benchmarkSchema),
  capabilities: z.array(z.string()),
  limitations: z.array(z.string()),
  highlights: z.array(highlightSchema),
  training_data_cutoff: z.string().optional(),
});

export type ExtractedModel = z.infer<typeof extractedModelSchema>;

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

export const EXTRACTION_PROMPT = `You are a structured data extractor for AI model cards. Given the raw text of a model card, extract the following information as JSON.

Required fields:
- provider: lowercase provider name (e.g. "anthropic", "openai", "meta", "google")
- name: lowercase kebab-case model identifier (e.g. "claude-sonnet-4", "gpt-4o")
- display_name: human-readable model name (e.g. "Claude Sonnet 4", "GPT-4o")
- benchmarks: array of { name, score, unit? } for each benchmark mentioned
- capabilities: array of capability strings
- limitations: array of limitation strings
- highlights: array of { label, value } for the 3-5 most impressive/notable stats

Optional fields:
- description: brief description of the model
- parameter_count: parameter count as string (e.g. "175B", "70B")
- context_window: context window size as number (e.g. 200000)
- training_data_cutoff: training data cutoff date as string

Return ONLY valid JSON, no markdown fences or explanation.`;

interface ExtractOptions {
  client?: Anthropic;
}

export async function extractModelCard(
  text: string,
  options?: ExtractOptions,
): Promise<ExtractedModel> {
  const client = options?.client ?? new Anthropic();

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await delay(BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: `${EXTRACTION_PROMPT}\n\n---\n\n${text}` }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const parsed = JSON.parse(content.text);
      return extractedModelSchema.parse(parsed);
    } catch (err) {
      lastError = err;
    }
  }

  throw new ExtractionError(
    `Extraction failed after ${MAX_RETRIES} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
