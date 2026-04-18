interface BenchmarkCardProps {
  data: { name: string; score: number; unit?: string };
  index?: number;
}

const BENCH_PALETTE = ['card-sage', 'card-sky', 'card-mint', 'card-butter'] as const;
const FILL_BY_TONE: Record<string, string> = {
  'card-sage': 'var(--c-sage-deep)',
  'card-sky': 'var(--c-sky-deep)',
  'card-mint': 'var(--c-mint-deep)',
  'card-butter': 'var(--c-butter-deep)',
  'card-blush': 'var(--c-blush-deep)',
  'card-peach': 'var(--c-peach-deep)',
  'card-lavender': 'var(--c-lavender-deep)',
};

export function BenchmarkCard({ data, index = 0 }: BenchmarkCardProps) {
  const tone = data.score >= 90
    ? 'card-mint'
    : data.score >= 70
      ? BENCH_PALETTE[index % BENCH_PALETTE.length]
      : 'card-blush';
  const fillColor = FILL_BY_TONE[tone];
  const pct = Math.min((data.score / 100) * 100, 100);

  return (
    <div className={`bento-card ${tone}`} data-card>
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
          {data.name}
        </span>
        {data.score >= 90 && (
          <svg width="16" height="16" viewBox="0 0 24 24" className="text-[color:var(--ink)]" fill="currentColor">
            <path d="M12 1l1.8 8.2L22 11l-8.2 1.8L12 21l-1.8-8.2L2 11l8.2-1.8z" />
          </svg>
        )}
      </div>

      <div className="mt-auto">
        <p className="font-display tnum text-[clamp(2.2rem,3.4vw,3.6rem)] font-semibold leading-none text-[color:var(--ink)]">
          {data.score}
          <span className="ml-0.5 text-[0.55em] font-medium text-[color:var(--ink-soft)]">
            {data.unit ?? '%'}
          </span>
        </p>
        <div className="mt-3 bar-track">
          <div
            className="bar-fill"
            data-score-bar
            style={{ width: `${pct}%`, background: fillColor }}
          />
        </div>
      </div>
    </div>
  );
}
