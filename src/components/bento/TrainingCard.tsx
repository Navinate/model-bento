interface TrainingCardProps {
  data: { trainingDataCutoff: string };
  index?: number;
}

export function TrainingCard({ data }: TrainingCardProps) {
  return (
    <div className="bento-card card-sky col-span-2 row-span-1" data-card>
      <div className="flex items-start justify-between">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
          Training cutoff
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[color:var(--ink-soft)] opacity-70">
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 9h18" />
          <path d="M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
      </div>

      <p className="font-display mt-auto text-[clamp(1.85rem,2.6vw,2.6rem)] font-semibold leading-[1] text-[color:var(--ink)]">
        {data.trainingDataCutoff}
      </p>

      <svg
        aria-hidden
        className="absolute bottom-5 right-6 text-[color:var(--ink)] opacity-25"
        width="64"
        height="10"
        viewBox="0 0 64 10"
        fill="none"
      >
        <path d="M2 5 Q 10 1, 18 5 T 34 5 T 50 5 T 62 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </div>
  );
}
