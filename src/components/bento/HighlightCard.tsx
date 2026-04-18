interface HighlightCardProps {
  data: { label: string; value: string };
  index?: number;
}

const HL_PALETTE = ['card-lavender', 'card-sage', 'card-peach', 'card-sky', 'card-mint'] as const;

export function HighlightCard({ data, index = 0 }: HighlightCardProps) {
  const tone = HL_PALETTE[index % HL_PALETTE.length];

  return (
    <div className={`bento-card ${tone} col-span-1 row-span-1`} data-card>
      <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
        {data.label}
      </span>

      <p className="font-display mt-auto text-[clamp(1.5rem,2.2vw,2.25rem)] font-semibold leading-[1.05] text-[color:var(--ink)] line-clamp-3">
        {data.value}
      </p>
    </div>
  );
}
