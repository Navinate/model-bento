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
  return (
    <div
      className="bento-grid"
    >
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
