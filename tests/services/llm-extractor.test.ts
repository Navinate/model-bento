import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractModelCard, extractedModelSchema, ExtractionError } from '../../src/lib/services/llm-extractor';

const fixturesDir = join(__dirname, '..', 'fixtures');
const sampleText = readFileSync(join(fixturesDir, 'sample-model-card.txt'), 'utf-8');
const sampleExtracted = JSON.parse(readFileSync(join(fixturesDir, 'sample-extracted.json'), 'utf-8'));

/** Helper to build a mock Anthropic client that returns the given responses in sequence. */
function mockClient(responses: Array<{ content: string } | { error: Error }>) {
  let callCount = 0;
  return {
    messages: {
      create: async () => {
        const response = responses[callCount++];
        if (!response) throw new Error('No more mock responses');
        if ('error' in response) throw response.error;
        return {
          content: [{ type: 'text' as const, text: response.content }],
        };
      },
    },
    get callCount() { return callCount; },
  };
}

describe('llm-extractor', () => {
  it('extracts structured data from model card text', async () => {
    const client = mockClient([{ content: JSON.stringify(sampleExtracted) }]);

    const result = await extractModelCard(sampleText, { client: client as any });

    expect(result.provider).toBe('anthropic');
    expect(result.name).toBe('claude-sonnet-4');
    expect(result.display_name).toBe('Claude Sonnet 4');
    expect(result.benchmarks.length).toBeGreaterThan(0);
    expect(result.capabilities.length).toBeGreaterThan(0);
    // Validate against Zod schema
    expect(() => extractedModelSchema.parse(result)).not.toThrow();
  });

  it('rejects malformed Claude response and retries', async () => {
    const client = mockClient([
      { content: 'not valid json at all {{{' },
      { content: JSON.stringify(sampleExtracted) },
    ]);

    const result = await extractModelCard(sampleText, { client: client as any });

    expect(result.provider).toBe('anthropic');
    expect(client.callCount).toBe(2);
  });

  it('fails after max retries with clear error', async () => {
    const client = mockClient([
      { content: 'bad json 1' },
      { content: 'bad json 2' },
      { content: 'bad json 3' },
    ]);

    try {
      await extractModelCard(sampleText, { client: client as any });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractionError);
      expect((err as Error).message).toMatch(/extraction failed/i);
    }
  });

  it('handles Claude API timeout', async () => {
    const timeoutError = new Error('Request timed out');
    timeoutError.name = 'APIConnectionTimeoutError';

    const client = mockClient([
      { error: timeoutError },
      { error: timeoutError },
      { error: timeoutError },
    ]);

    await expect(extractModelCard(sampleText, { client: client as any }))
      .rejects
      .toThrow(/extraction failed/i);
  });

  it('Zod schema rejects missing required fields', () => {
    const incomplete = {
      name: 'claude-sonnet-4',
      display_name: 'Claude Sonnet 4',
      // missing 'provider' and other required fields
    };

    expect(() => extractedModelSchema.parse(incomplete)).toThrow();
  });
});
