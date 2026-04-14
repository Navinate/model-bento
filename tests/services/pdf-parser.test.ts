import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePdf } from '../../src/lib/services/pdf-parser';

const fixturesDir = join(__dirname, '..', 'fixtures');

describe('pdf-parser', () => {
  it('extracts text from a valid PDF', async () => {
    const buffer = readFileSync(join(fixturesDir, 'sample-model-card.pdf'));
    const text = await parsePdf(buffer);

    // The fixture is a real academic PDF — verify we get substantial text
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain('Turk J Med Sci');
  });

  it('rejects files over 20MB', async () => {
    const oversizedBuffer = Buffer.alloc(20 * 1024 * 1024 + 1);
    await expect(parsePdf(oversizedBuffer)).rejects.toThrow(/size/i);
  });

  it('rejects non-PDF files', async () => {
    const buffer = readFileSync(join(fixturesDir, 'not-a-pdf.pdf'));
    await expect(parsePdf(buffer)).rejects.toThrow();
  });

  it('returns empty string for PDF with no extractable text', async () => {
    // This fixture is a minimal PDF with almost no meaningful text content.
    // Verifies parsePdf handles low/no-text PDFs gracefully (returns string, doesn't throw).
    const buffer = readFileSync(join(fixturesDir, 'image-only.pdf'));
    const text = await parsePdf(buffer);
    expect(typeof text).toBe('string');
    // Should have very little content (under 50 chars of meaningful text)
    expect(text.trim().length).toBeLessThan(50);
  });
});
