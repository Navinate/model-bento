interface StatCardProps {
  data: { label: string; value: string | number };
  index?: number;
}

const STAT_PALETTE = ['card-mint', 'card-butter', 'card-sky', 'card-lavender'] as const;

function formatValue(value: string | number): string {
  if (typeof value === 'string') return value;
  if (value >= 1e12) return `${(value / 1e12).toFixed(value % 1e12 === 0 ? 0 : 1)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(value % 1e9 === 0 ? 0 : 1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(value % 1e6 === 0 ? 0 : 1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(value % 1e3 === 0 ? 0 : 1)}K`;
  return String(value);
}

export function StatCard({ data, index = 0 }: StatCardProps) {
  const tone = STAT_PALETTE[index % STAT_PALETTE.length];
  const display = formatValue(data.value);

  return (
    <div className={`bento-card ${tone} col-span-1 row-span-1`} data-card>
      <div className="flex items-start justify-between">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
          {data.label}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" className="text-[color:var(--ink-soft)] opacity-50" fill="currentColor">
          <path d="M12 1l1.8 8.2L22 11l-8.2 1.8L12 21l-1.8-8.2L2 11l8.2-1.8z" />
        </svg>
      </div>

      <p className="font-display tnum mt-auto text-[clamp(2.4rem,4vw,4.25rem)] font-semibold leading-none text-[color:var(--ink)]">
        {display}
      </p>

      {/* squiggle underline */}
      <svg
        aria-hidden
        className="mt-2 -ml-1 text-[color:var(--ink)] opacity-25"
        width="68"
        height="8"
        viewBox="0 0 68 8"
        fill="none"
      >
        <path d="M2 4 Q 8 1, 14 4 T 26 4 T 38 4 T 50 4 T 62 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </div>
  );
}
