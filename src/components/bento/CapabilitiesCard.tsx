interface CapabilitiesCardProps {
  data: { capabilities: string[] };
  index?: number;
}

const ROTATIONS = ['-2.5deg', '1.5deg', '-1deg', '2deg', '-1.5deg', '0.5deg', '-0.75deg', '1.75deg'];

export function CapabilitiesCard({ data }: CapabilitiesCardProps) {
  return (
    <div className="bento-card card-butter col-span-2 row-span-1" data-card>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
          Can do
        </span>
        <span className="font-mono text-[0.65rem] text-[color:var(--ink-faint)]">
          {data.capabilities.length}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 content-start">
        {data.capabilities.map((cap, i) => (
          <span
            key={cap}
            className={`chip chip-tint-${i % 6}`}
            style={{ transform: `rotate(${ROTATIONS[i % ROTATIONS.length]})` }}
          >
            {cap}
          </span>
        ))}
      </div>
    </div>
  );
}
