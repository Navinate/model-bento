interface BenchmarkCardProps {
  data: { name: string; score: number; unit?: string };
}

export function BenchmarkCard({ data }: BenchmarkCardProps) {
  const maxScore = 100;
  const pct = Math.min((data.score / maxScore) * 100, 100);

  return (
    <div className="rounded-3xl bg-white p-6 flex flex-col justify-between" data-card>
      <p className="text-sm font-medium text-slate-500">{data.name}</p>
      <div className="mt-3">
        <p className="text-3xl font-bold text-slate-900">
          {data.score}{data.unit ?? ''}
        </p>
        <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-slate-900"
            data-score-bar
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
