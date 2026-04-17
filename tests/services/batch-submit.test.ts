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
