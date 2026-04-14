import { describe, it, expect } from 'vitest';
import { generateOGImage } from '../../src/lib/services/og-generator';

describe('og-generator', () => {
  it('generates a PNG image buffer from model data', async () => {
    const buffer = await generateOGImage({
      displayName: 'Claude Sonnet 4',
      provider: 'anthropic',
      highlights: [
        { label: 'Parameters', value: '175B' },
        { label: 'Context Window', value: '200K tokens' },
        { label: 'GSM8K', value: '96.4%' },
      ],
    });

    expect(buffer).toBeInstanceOf(Buffer);
    // PNG magic number: 89 50 4E 47
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
  });

  it('generated image is reasonable size (< 500KB)', async () => {
    const buffer = await generateOGImage({
      displayName: 'Claude Sonnet 4',
      provider: 'anthropic',
      highlights: [
        { label: 'Parameters', value: '175B' },
      ],
    });

    expect(buffer.length).toBeLessThan(500 * 1024);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('works with no highlights', async () => {
    const buffer = await generateOGImage({
      displayName: 'Minimal Model',
      provider: 'test',
      highlights: [],
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer[0]).toBe(0x89); // PNG magic number
  });
});
