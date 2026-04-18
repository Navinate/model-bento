import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface ChartCardProps {
  data: { benchmarks: Array<{ name: string; score: number }> };
  index?: number;
}

const PALETTE = ['#6dc99a', '#6ba8ff', '#f3c93b', '#a892ff', '#ff8898', '#88b660'];

export function ChartCard({ data }: ChartCardProps) {
  return (
    <div className="bento-card card-cream col-span-2 row-span-2" data-card>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
          Benchmarks
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" className="text-[color:var(--ink-soft)] opacity-60" fill="currentColor">
          <path d="M12 1l1.8 8.2L22 11l-8.2 1.8L12 21l-1.8-8.2L2 11l8.2-1.8z" />
        </svg>
      </div>

      <h3 className="font-display mt-1 text-[1.75rem] font-semibold leading-tight text-[color:var(--ink)]">
        How it scores.
      </h3>

      <div className="mt-3 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.benchmarks} layout="vertical" margin={{ top: 4, right: 36, left: 0, bottom: 4 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={92}
              tick={{ fontSize: 11, fill: 'var(--ink-soft)', fontFamily: 'Geist Mono, monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <Bar dataKey="score" radius={[8, 8, 8, 8]} barSize={18}>
              {data.benchmarks.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
              <LabelList
                dataKey="score"
                position="right"
                style={{ fill: 'var(--ink)', fontSize: 12, fontFamily: 'Fraunces, serif', fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
