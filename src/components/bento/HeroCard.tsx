interface HeroCardProps {
  data: { displayName: string; provider: string; description?: string };
  index?: number;
}

export function HeroCard({ data }: HeroCardProps) {
  const initial = data.provider?.charAt(0).toUpperCase() ?? '?';

  return (
    <div className="bento-card card-peach col-span-2 row-span-2" data-card>
      {/* Decorative orb */}
      <div
        aria-hidden
        className="absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-60 blur-2xl"
        style={{ background: 'radial-gradient(circle at 30% 30%, var(--c-peach-deep), transparent 70%)' }}
      />
      {/* Sparkles */}
      <svg className="sparkle" style={{ top: '1rem', right: '1.25rem', width: 18, height: 18 }} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 1l1.8 8.2L22 11l-8.2 1.8L12 21l-1.8-8.2L2 11l8.2-1.8z" />
      </svg>
      <svg className="sparkle" style={{ top: '3.4rem', right: '3rem', width: 9, height: 9, opacity: 0.55 }} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 1l1.8 8.2L22 11l-8.2 1.8L12 21l-1.8-8.2L2 11l8.2-1.8z" />
      </svg>

      <div className="relative flex items-center gap-2.5">
        <span className="monogram">{initial}</span>
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
          {data.provider}
        </span>
      </div>

      <div className="relative mt-auto">
        <h2 className="font-display text-[clamp(2.6rem,3.6vw,4.25rem)] font-semibold leading-[0.95] text-[color:var(--ink)]">
          <span className="italic" style={{ fontVariationSettings: '"SOFT" 80, "WONK" 1, "opsz" 144' }}>
            {data.displayName}
          </span>
        </h2>
        {data.description && (
          <p className="mt-4 max-w-[34ch] text-[0.95rem] leading-snug text-[color:var(--ink-soft)] line-clamp-3">
            {data.description}
          </p>
        )}
      </div>

      {/* Hand-drawn underline accent */}
      <svg
        aria-hidden
        className="absolute bottom-5 right-6 opacity-40"
        width="84"
        height="14"
        viewBox="0 0 84 14"
        fill="none"
      >
        <path
          d="M2 9C 14 3, 32 12, 46 6 S 76 4, 82 8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
