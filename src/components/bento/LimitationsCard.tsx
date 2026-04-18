interface LimitationsCardProps {
  data: { limitations: string[] };
  index?: number;
}

export function LimitationsCard({ data }: LimitationsCardProps) {
  return (
    <div className="bento-card card-blush col-span-2 row-span-1" data-card>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
          Caveats
        </span>
        <span className="font-mono text-[0.65rem] text-[color:var(--ink-faint)]">
          {data.limitations.length}
        </span>
      </div>

      <ul className="mt-3 space-y-2 overflow-hidden">
        {data.limitations.slice(0, 5).map((lim) => (
          <li key={lim} className="flex items-start gap-2.5 text-[0.875rem] leading-snug text-[color:var(--ink)]">
            <span
              aria-hidden
              className="mt-[0.4rem] inline-block h-1.5 w-1.5 flex-none rounded-full"
              style={{ background: 'var(--c-blush-deep)' }}
            />
            <span className="line-clamp-2">{lim}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
