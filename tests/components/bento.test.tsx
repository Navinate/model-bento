import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BentoGrid } from '../../src/components/bento/BentoGrid';
import { HeroCard } from '../../src/components/bento/HeroCard';
import { StatCard } from '../../src/components/bento/StatCard';
import { BenchmarkCard } from '../../src/components/bento/BenchmarkCard';
import { ChartCard } from '../../src/components/bento/ChartCard';
import { CapabilitiesCard } from '../../src/components/bento/CapabilitiesCard';
import type { LayoutCard } from '../../src/lib/layout-engine';

afterEach(() => cleanup());

const fixturesDir = join(__dirname, '..', 'fixtures');
const sampleLayout: LayoutCard[] = JSON.parse(
  readFileSync(join(fixturesDir, 'sample-layout.json'), 'utf-8'),
);

describe('bento components', () => {
  it('BentoGrid renders correct number of cards for layout', () => {
    const { container } = render(<BentoGrid layout={sampleLayout} />);
    const cards = container.querySelectorAll('[data-card]');
    expect(cards.length).toBe(sampleLayout.length);
  });

  it('HeroCard displays model name and provider', () => {
    const { container } = render(
      <HeroCard data={{ displayName: 'Claude Sonnet 4', provider: 'anthropic' }} />,
    );
    const view = within(container);
    expect(view.getByText('Claude Sonnet 4')).toBeDefined();
    expect(view.getByText(/anthropic/i)).toBeDefined();
  });

  it('StatCard formats large numbers with abbreviations', () => {
    const { container } = render(
      <StatCard data={{ label: 'Parameters', value: 175000000000 }} />,
    );
    expect(within(container).getByText('175B')).toBeDefined();
  });

  it('BenchmarkCard renders score bar at correct width', () => {
    const { container } = render(
      <BenchmarkCard data={{ name: 'MMLU', score: 85, unit: '%' }} />,
    );
    const bar = container.querySelector('[data-score-bar]');
    expect(bar).not.toBeNull();
    expect((bar as HTMLElement).style.width).toBe('85%');
  });

  it('ChartCard renders a Recharts chart without crashing', () => {
    const benchmarks = [
      { name: 'MMLU', score: 92.3 },
      { name: 'HumanEval', score: 89.1 },
      { name: 'GSM8K', score: 96.4 },
    ];
    expect(() => {
      render(<ChartCard data={{ benchmarks }} />);
    }).not.toThrow();
  });

  it('CapabilitiesCard renders all tags', () => {
    const capabilities = ['Code gen', 'Summarization', 'Reasoning', 'Translation', 'Analysis'];
    const { container } = render(
      <CapabilitiesCard data={{ capabilities }} />,
    );
    const view = within(container);
    for (const cap of capabilities) {
      expect(view.getByText(cap)).toBeDefined();
    }
  });

  it('each card type has correct grid sizing class', () => {
    const { container: heroContainer } = render(
      <HeroCard data={{ displayName: 'Test', provider: 'test' }} />,
    );
    expect(heroContainer.querySelector('.col-span-2.row-span-2')).not.toBeNull();
    cleanup();

    const { container: statContainer } = render(
      <StatCard data={{ label: 'Params', value: '175B' }} />,
    );
    expect(statContainer.querySelector('.col-span-1.row-span-1')).not.toBeNull();
  });
});
