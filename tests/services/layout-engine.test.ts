import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { generateLayout, type LayoutCard } from '../../src/lib/layout-engine';
import type { ExtractedModel } from '../../src/lib/services/llm-extractor';

const fixturesDir = join(__dirname, '..', 'fixtures');
const sampleExtracted: ExtractedModel = JSON.parse(
  readFileSync(join(fixturesDir, 'sample-extracted.json'), 'utf-8'),
);

describe('layout-engine', () => {
  it('produces a valid grid layout from extracted data', () => {
    const layout = generateLayout(sampleExtracted);

    expect(Array.isArray(layout)).toBe(true);
    expect(layout.length).toBeGreaterThan(0);

    for (const card of layout) {
      expect(card).toHaveProperty('type');
      expect(card).toHaveProperty('gridColumn');
      expect(card).toHaveProperty('gridRow');
      expect(card).toHaveProperty('data');
      expect(typeof card.gridColumn).toBe('string');
      expect(typeof card.gridRow).toBe('string');
    }
  });

  it('hero card is always present and 2x2', () => {
    const layout = generateLayout(sampleExtracted);

    const heroCards = layout.filter((c) => c.type === 'hero');
    expect(heroCards).toHaveLength(1);

    const hero = heroCards[0];
    expect(hero.gridColumn).toContain('span 2');
    expect(hero.gridRow).toContain('span 2');
  });

  it('high-score benchmarks get 2x1 cards, low-score get 1x1', () => {
    const input: ExtractedModel = {
      ...sampleExtracted,
      benchmarks: [
        { name: 'HighBench', score: 95, unit: '%' },
        { name: 'LowBench', score: 40, unit: '%' },
      ],
    };

    const layout = generateLayout(input);

    const highBench = layout.find(
      (c) => c.type === 'benchmark' && c.data.name === 'HighBench',
    );
    const lowBench = layout.find(
      (c) => c.type === 'benchmark' && c.data.name === 'LowBench',
    );

    expect(highBench).toBeDefined();
    expect(lowBench).toBeDefined();
    expect(highBench!.gridColumn).toContain('span 2');
    expect(lowBench!.gridColumn).not.toContain('span 2');
  });

  it('handles minimal data gracefully', () => {
    const minimal: ExtractedModel = {
      provider: 'test',
      name: 'minimal-model',
      display_name: 'Minimal Model',
      benchmarks: [],
      capabilities: [],
      limitations: [],
      highlights: [],
    };

    const layout = generateLayout(minimal);

    expect(layout.length).toBeGreaterThan(0);
    // Hero card should still be present
    expect(layout.some((c) => c.type === 'hero')).toBe(true);
  });

  it('handles maximal data without overflow', () => {
    const maximal: ExtractedModel = {
      ...sampleExtracted,
      benchmarks: Array.from({ length: 20 }, (_, i) => ({
        name: `Bench${i}`,
        score: 50 + i * 2,
        unit: '%',
      })),
      capabilities: Array.from({ length: 10 }, (_, i) => `Capability ${i}`),
      limitations: Array.from({ length: 5 }, (_, i) => `Limitation ${i}`),
    };

    const layout = generateLayout(maximal);

    // Verify no cards extend beyond column 12
    for (const card of layout) {
      const colMatch = card.gridColumn.match(/(\d+)\s*\/\s*span\s+(\d+)/);
      if (colMatch) {
        const start = parseInt(colMatch[1], 10);
        const span = parseInt(colMatch[2], 10);
        expect(start + span - 1).toBeLessThanOrEqual(12);
      }
    }

    // Verify no overlapping areas
    const occupied = new Set<string>();
    for (const card of layout) {
      const colMatch = card.gridColumn.match(/(\d+)\s*\/\s*span\s+(\d+)/);
      const rowMatch = card.gridRow.match(/(\d+)\s*\/\s*span\s+(\d+)/);
      if (colMatch && rowMatch) {
        const colStart = parseInt(colMatch[1], 10);
        const colSpan = parseInt(colMatch[2], 10);
        const rowStart = parseInt(rowMatch[1], 10);
        const rowSpan = parseInt(rowMatch[2], 10);

        for (let c = colStart; c < colStart + colSpan; c++) {
          for (let r = rowStart; r < rowStart + rowSpan; r++) {
            const key = `${c},${r}`;
            expect(occupied.has(key), `Cell ${key} is occupied by multiple cards`).toBe(false);
            occupied.add(key);
          }
        }
      }
    }
  });

  it('output matches sample-layout.json for known input', () => {
    const fixturePath = join(fixturesDir, 'sample-layout.json');
    expect(existsSync(fixturePath), 'sample-layout.json fixture must exist').toBe(true);

    const expectedLayout = JSON.parse(readFileSync(fixturePath, 'utf-8'));
    const layout = generateLayout(sampleExtracted);

    expect(layout).toEqual(expectedLayout);
  });
});
