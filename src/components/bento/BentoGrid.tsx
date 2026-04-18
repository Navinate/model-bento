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

const cardComponents: Record<LayoutCard['type'], React.ComponentType<{ data: any; index: number }>> = {
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
    const cleanups: Array<() => void> = [];

    cards.forEach((card, i) => {
      const cleanup = inView(
        card,
        () => {
          animate(
            card,
            { opacity: [0, 1], transform: ['translateY(24px) scale(0.97)', 'translateY(0) scale(1)'] },
            { duration: 0.7, delay: i * 0.06, easing: [0.22, 1, 0.36, 1] },
          );
          // Animate any benchmark bar fills inside this card
          const bars = card.querySelectorAll<HTMLElement>('[data-score-bar]');
          bars.forEach((bar) => {
            const target = bar.style.width;
            bar.style.width = '0%';
            requestAnimationFrame(() => {
              bar.style.width = target;
            });
          });
        },
        { amount: 0.2 },
      );
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
            className="bento-grid-cell"
            style={{ gridColumn: card.gridColumn, gridRow: card.gridRow }}
          >
            <Component data={card.data} index={i} />
          </div>
        );
      })}
    </div>
  );
}
