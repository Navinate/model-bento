interface StatCardProps {
  data: { label: string; value: string | number };
}

function formatValue(value: string | number): string {
  if (typeof value === 'string') return value;
  if (value >= 1e12) return `${(value / 1e12).toFixed(value % 1e12 === 0 ? 0 : 1)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(value % 1e9 === 0 ? 0 : 1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(value % 1e6 === 0 ? 0 : 1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(value % 1e3 === 0 ? 0 : 1)}K`;
  return String(value);
}

export function StatCard({ data }: StatCardProps) {
  return (
    <div className="col-span-1 row-span-1 rounded-3xl bg-white p-6 flex flex-col justify-between" data-card>
      <p className="text-sm font-medium text-slate-500">{data.label}</p>
      <p className="text-5xl font-bold text-slate-900">{formatValue(data.value)}</p>
    </div>
  );
}
