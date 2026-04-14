import { useEffect, useRef } from 'react';
import { animate, inView } from 'motion';
import type { LayoutCard } from '../../lib/layout-engine';
import { HeroCard } from './HeroCard';
import { StatCard } from './StatCard';
import { BenchmarkCard } from './BenchmarkCard';
import { ChartCard } from './ChartCard';
import { CapabilitiesCard } from './CapabilitiesCard';
import { LimitationsCard } from './LimitationsCard';
import { TrainingCard } from './TrainingCard';
import { HighlightCard } from './HighlightCard';

interface BentoGridProps {
  layout: LayoutCard[];
}

const cardComponents: Record<LayoutCard['type'], React.ComponentType<{ data: any }>> = {
  hero: HeroCard,
  stat: StatCard,
  benchmark: BenchmarkCard,
  chart: ChartCard,
  capabilities: CapabilitiesCard,
  limitations: LimitationsCard,
  training: TrainingCard,
  highlight: HighlightCard,
};

export function BentoGrid({ layout }: BentoGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gridRef.current) return;

    const cards = gridRef.current.querySelectorAll<HTMLElement>('[data-card]');
    // Initial opacity is set via CSS (.bento-grid [data-card] { opacity: 0 })

    const cleanups: Array<() => void> = [];
    cards.forEach((card, i) => {
      const cleanup = inView(card, () => {
        animate(card, { opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0px)'] }, {
          duration: 0.5,
          delay: i * 0.08,
          easing: 'ease-out',
        });
      }, { amount: 0.2 });
      cleanups.push(cleanup);
    });

    return () => cleanups.forEach((fn) => fn());
  }, [layout]);

  return (
    <div className="bento-grid" ref={gridRef}>
      {layout.map((card, i) => {
        const Component = cardComponents[card.type];
        return (
          <div
            key={i}
            style={{
              gridColumn: card.gridColumn,
              gridRow: card.gridRow,
            }}
          >
            <Component data={card.data} />
          </div>
        );
      })}
    </div>
  );
}
